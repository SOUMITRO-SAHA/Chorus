//! Data models shared between the Rust providers and the frontend.
//! Field names are camelCase on the wire (`serde` rename) to match TS.

use serde::{Deserialize, Serialize};

/// One playable/browseable thing (video, song, album, ...).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    /// "Channel • 1.2M views • 3 days ago" style one-liner
    pub subtitle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    /// "video" | "song" | "album" | "spotify-track"
    #[serde(default = "default_kind")]
    pub kind: String,
    /// 30s preview (Spotify only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
}

fn default_kind() -> String {
    "video".into()
}

impl MediaItem {
    pub fn new(
        id: impl Into<String>,
        title: impl Into<String>,
        subtitle: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            subtitle: subtitle.into(),
            duration: None,
            thumbnail: None,
            kind: default_kind(),
            preview_url: None,
        }
    }
}

/// A titled row of items on a feed screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub title: String,
    pub items: Vec<MediaItem>,
}

/// Everything the watch screen needs for one video.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchData {
    pub video: MediaItem,
    /// Direct progressive stream (muxed audio+video) — plays in a plain
    /// `<video>` element.
    pub stream_url: Option<String>,
    pub related: Vec<MediaItem>,
}

/// A music track with its direct audio (and video) stream URLs.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrack {
    pub video: MediaItem,
    pub audio_url: Option<String>,
    pub video_url: Option<String>,
}
