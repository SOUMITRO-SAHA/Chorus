//! YouTube Music provider — home shelves, song search, playback.

use serde_json::{Value, json};

use crate::modules::providers::innertube::{
    self, CHROME_UA, MUSIC_HOST, collect_all, it, parse_music_item,
};
use crate::shared::domain::{MediaItem, MusicTrack, Shelf};

#[tauri::command]
pub async fn music_home() -> Result<Vec<Shelf>, String> {
    home().await
}

#[tauri::command]
pub async fn music_search(query: String) -> Result<Vec<MediaItem>, String> {
    search(&query).await
}

#[tauri::command]
pub async fn music_play(video_id: String) -> Result<MusicTrack, String> {
    play(&video_id).await
}

pub async fn home() -> Result<Vec<Shelf>, String> {
    let (client, cn) = it().remix().await;
    let browse = it()
        .call(
            MUSIC_HOST,
            "browse",
            client,
            &cn,
            CHROME_UA,
            json!({ "browseId": "FEmusic_home" }),
        )
        .await?;

    let mut shelves = Vec::new();
    for shelf in collect_all(&browse, "musicCarouselShelfRenderer") {
        let title = shelf
            .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
            .and_then(Value::as_str)
            .unwrap_or("More for you")
            .to_string();
        let items: Vec<MediaItem> = collect_all(shelf, "musicResponsiveListItemRenderer")
            .iter()
            .filter_map(|i| {
                parse_music_item(i).map(|mut it| {
                    it.kind = "song".into();
                    it
                })
            })
            .collect();
        if !items.is_empty() {
            shelves.push(Shelf {
                title,
                items: items.into_iter().take(20).collect(),
            });
        }
        if shelves.len() >= 6 {
            break;
        }
    }

    if shelves.is_empty() {
        // Fallback: curated search shelf.
        let items = search("new music this week").await?;
        if items.is_empty() {
            return Err("YouTube Music feed is unavailable right now".into());
        }
        shelves.push(Shelf {
            title: "New music".into(),
            items,
        });
    }
    Ok(shelves)
}

pub async fn search(query: &str) -> Result<Vec<MediaItem>, String> {
    // Merge YT Music catalog songs with regular YouTube videos: catalog
    // tracks are verification-gated for anonymous clients (see
    // docs/reverse-engineering/innertube.md), videos are the playable path.
    let (catalog, videos) = tokio::join!(
        search_remix(query),
        crate::modules::providers::youtube::search(query)
    );

    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for list in [catalog, videos].into_iter().flatten() {
        for item in list {
            if seen.insert(item.id.clone()) {
                items.push(item);
            }
        }
    }
    if items.is_empty() {
        return Err("No results found".into());
    }
    items.truncate(30);
    Ok(items)
}

async fn search_remix(query: &str) -> Result<Vec<MediaItem>, String> {
    let (client, cn) = it().remix().await;
    let response = it()
        .call(
            MUSIC_HOST,
            "search",
            client,
            &cn,
            CHROME_UA,
            json!({ "query": query }),
        )
        .await?;
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for v in collect_all(&response, "musicResponsiveListItemRenderer") {
        if let Some(item) = parse_music_item(v)
            && seen.insert(item.id.clone())
        {
            items.push(item);
        }
        if items.len() >= 20 {
            break;
        }
    }
    Ok(items)
}

/// Resolve a song: audio (itag 140 AAC) + fallback video stream.
pub async fn play(video_id: &str) -> Result<MusicTrack, String> {
    let player = it().player(video_id).await?;
    if player["playabilityStatus"]["status"].as_str() != Some("OK") {
        let reason = player["playabilityStatus"]["reason"]
            .as_str()
            .unwrap_or("track unavailable");
        return Err(format!("Cannot play this track: {reason}"));
    }

    let details = &player["videoDetails"];
    let mut video = MediaItem::new(
        video_id,
        details["title"].as_str().unwrap_or("Untitled"),
        details["author"].as_str().unwrap_or_default(),
    );
    video.kind = "song".into();
    video.thumbnail = innertube::best_thumb(&details["thumbnail"]);

    let adaptive = player
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let audio_url = adaptive
        .iter()
        .find(|f| f["itag"].as_u64() == Some(140) && f["url"].is_string())
        .and_then(|f| f["url"].as_str().map(str::to_string));
    let video_url = adaptive
        .iter()
        .find(|f| {
            let mime = f["mimeType"].as_str().unwrap_or("");
            f["itag"].as_u64() == Some(18)
                || (f["url"].is_string()
                    && mime.starts_with("video/mp4")
                    && f["qualityLabel"].as_str() == Some("720p"))
        })
        .and_then(|f| f["url"].as_str().map(str::to_string));

    // Keep the unused host import meaningful for future video-mode playback.
    Ok(MusicTrack {
        video,
        audio_url,
        video_url,
    })
}
