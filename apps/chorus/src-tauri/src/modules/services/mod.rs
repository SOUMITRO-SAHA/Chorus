//! Registry of the streaming services Chorus can embed.
//!
//! Each service maps to the *official* web app, loaded inside a persistent
//! webview so authentication, playback quality and the UI are 100% identical
//! to the real service — Chorus only intercepts advertising/tracking traffic.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    YouTube,
    YouTubeMusic,
    Spotify,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
impl Kind {
    pub fn slug(&self) -> &'static str {
        match self {
            Kind::YouTube => "youtube",
            Kind::YouTubeMusic => "youtube-music",
            Kind::Spotify => "spotify",
        }
    }
}

pub struct Service {
    pub id: &'static str,
    pub title: &'static str,
    pub url: &'static str,
    pub kind: Kind,
}

pub const SERVICES: &[Service] = &[
    Service {
        id: "youtube",
        title: "YouTube",
        url: "https://www.youtube.com/",
        kind: Kind::YouTube,
    },
    Service {
        id: "youtube-music",
        title: "YouTube Music",
        url: "https://music.youtube.com/",
        kind: Kind::YouTubeMusic,
    },
    Service {
        id: "spotify",
        title: "Spotify",
        url: "https://open.spotify.com/",
        kind: Kind::Spotify,
    },
];

pub fn find(id: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.id == id)
}

impl Service {
    /// Tauri window/webview label (alphanumeric, `-`, `/`, `_` only).
    pub fn window_label(&self) -> &'static str {
        match self.kind {
            Kind::YouTube => "service-youtube",
            Kind::YouTubeMusic => "service-youtube-music",
            Kind::Spotify => "service-spotify",
        }
    }
}

/// A plain desktop-Chrome user agent. Embedded webviews present the raw
/// WKWebView/WebView UA, which Google and Spotify actively reject during
/// sign-in ("this browser or app may not be secure" / disallowed_useragent).
/// A standard desktop UA lets the *official* login flows run untouched.
pub const DESKTOP_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Origin the frontend is served from (used by the injected browser chrome:
/// its ⌂ button navigates back to the Chorus app).
pub fn home_origin() -> &'static str {
    if cfg!(any(target_os = "ios", target_os = "macos")) {
        "tauri://localhost"
    } else {
        "http://tauri.localhost"
    }
}
