//! YouTube provider — home feed, search, watch (streams + related).

use serde_json::{Value, json};

use crate::modules::providers::innertube::{
    self, CHROME_UA, YT_HOST, it, parse_lockup, parse_video_renderer,
};
use crate::shared::domain::{MediaItem, Shelf, WatchData};

#[tauri::command]
pub async fn youtube_home() -> Result<Vec<Shelf>, String> {
    home().await
}

#[tauri::command]
pub async fn youtube_search(query: String) -> Result<Vec<MediaItem>, String> {
    search(&query).await
}

#[tauri::command]
pub async fn youtube_watch(video_id: String) -> Result<WatchData, String> {
    watch(&video_id).await
}

/// Home feed. Falls back to curated search shelves when the anonymous
/// browse feed is degraded (nag/throttle) — never an empty screen.
pub async fn home() -> Result<Vec<Shelf>, String> {
    let (client, cn) = it().web().await;
    let browse = it()
        .call(
            YT_HOST,
            "browse",
            client,
            &cn,
            CHROME_UA,
            json!({ "browseId": "FEwhat_to_watch" }),
        )
        .await?;

    let items = videos_from_response(&browse);
    if items.len() >= 4 {
        return Ok(vec![Shelf {
            title: "For you".into(),
            items,
        }]);
    }

    // Fallback: curated searches as shelves.
    let mut shelves = Vec::new();
    for (title, query) in [
        ("Popular right now", "trending music video"),
        ("Fresh picks", "new music video this week"),
    ] {
        if let Ok(items) = search(query).await
            && !items.is_empty()
        {
            shelves.push(Shelf {
                title: title.into(),
                items: items.into_iter().take(16).collect(),
            });
        }
    }
    if shelves.is_empty() {
        return Err("YouTube home feed is unavailable right now".into());
    }
    Ok(shelves)
}
/// Extract videos (videoRenderer + lockupViewModel) from any response.
fn videos_from_response(response: &Value) -> Vec<MediaItem> {
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for v in innertube::collect_all(response, "videoRenderer") {
        if let Some(item) = parse_video_renderer(v)
            && seen.insert(item.id.clone())
        {
            items.push(item);
        }
    }
    for v in innertube::collect_all(response, "lockupViewModel") {
        if let Some(item) = parse_lockup(v)
            && seen.insert(item.id.clone())
        {
            items.push(item);
        }
    }
    items
}

pub async fn search(query: &str) -> Result<Vec<MediaItem>, String> {
    let response = it().search(query).await?;
    let items = videos_from_response(&response)
        .into_iter()
        .take(40)
        .collect();
    Ok(items)
}

/// Watch data: metadata + direct stream + related videos.
pub async fn watch(video_id: &str) -> Result<WatchData, String> {
    let player = it().player(video_id).await?;
    if player["playabilityStatus"]["status"].as_str() != Some("OK") {
        let reason = player["playabilityStatus"]["reason"]
            .as_str()
            .unwrap_or("video unavailable");
        return Err(format!("Cannot play this video: {reason}"));
    }

    let details = &player["videoDetails"];
    let mut video = MediaItem::new(
        video_id,
        details["title"].as_str().unwrap_or("Untitled"),
        details["author"].as_str().unwrap_or_default(),
    );
    let secs = details["lengthSeconds"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok());
    video.duration = secs.map(fmt_duration);
    video.thumbnail = innertube::best_thumb(&details["thumbnail"]);
    video.subtitle = format!(
        "{} • {} views",
        details["author"].as_str().unwrap_or_default(),
        fmt_count(
            details["viewCount"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0)
        )
    );

    // Best muxed (progressive) stream — plays in a plain <video> element.
    let stream_url = player
        .pointer("/streamingData/formats")
        .and_then(Value::as_array)
        .and_then(|formats| {
            formats
                .iter()
                .filter(|f| f["url"].is_string())
                .max_by_key(|f| f["itag"].as_u64().unwrap_or(0))
                .and_then(|f| f["url"].as_str().map(str::to_string))
        });

    // Related videos from the watch page.
    let (client, cn) = it().web().await;
    let next = it()
        .call(
            YT_HOST,
            "next",
            client,
            &cn,
            CHROME_UA,
            json!({ "videoId": video_id }),
        )
        .await
        .unwrap_or(Value::Null);
    let related: Vec<MediaItem> = videos_from_response(&next)
        .into_iter()
        .filter(|i| i.id != video_id)
        .take(24)
        .collect();

    Ok(WatchData {
        video,
        stream_url,
        related,
    })
}

/// Seconds → "3:33" / "1:02:04"
pub fn fmt_duration(total: u64) -> String {
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

/// 1828224836 → "1.8B"
pub fn fmt_count(n: u64) -> String {
    if n >= 1_000_000_000 {
        format!("{:.1}B", n as f64 / 1e9)
    } else if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1e6)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1e3)
    } else {
        n.to_string()
    }
}
