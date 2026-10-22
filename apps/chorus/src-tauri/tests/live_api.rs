//! Live protocol validation (real network). Run: `cargo test --test live_api`

use chorus_lib::modules::providers::{music, youtube};

#[test]
fn search_returns_videos() {
    tauri::async_runtime::block_on(async {
        let items = youtube::search("lofi hip hop").await.expect("search");
        assert!(items.len() >= 5, "expected results, got {}", items.len());
        assert!(!items[0].title.is_empty());
        assert!(items.iter().any(|i| i.thumbnail.is_some()));
    });
}

#[test]
fn watch_returns_stream_and_related() {
    tauri::async_runtime::block_on(async {
        let watch = youtube::watch("dQw4w9WgXcQ").await.expect("watch");
        assert!(
            watch
                .stream_url
                .as_deref()
                .unwrap_or_default()
                .starts_with("https://")
        );
        assert!(!watch.video.title.is_empty());
        assert!(!watch.related.is_empty(), "expected related videos");
    });
}

#[test]
fn music_search_and_play() {
    tauri::async_runtime::block_on(async {
        let items = music::search("blinding lights")
            .await
            .expect("music search");
        assert!(!items.is_empty(), "expected songs");

        // The official video streams cleanly; some third-party reuploads are
        // verification-gated by YouTube (documented in the REA ledger).
        let track = music::play("dQw4w9WgXcQ").await.expect("music play");
        assert!(track.audio_url.is_some(), "expected AAC audio stream");
    });
}
