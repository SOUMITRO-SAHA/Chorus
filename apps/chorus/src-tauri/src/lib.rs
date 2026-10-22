// The integration tests (tests/) drive the real command surface through
// these roots; everything below them stays crate-internal.
pub mod modules;
pub mod shared;

use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            modules::browser::init(app.handle())?;

            let handle = app.handle().clone();

            // Home / shell window. On mobile it is also the Chorus Browser
            // surface (open_browser navigates it in place), so it gets the
            // blocking scripts + browser chrome injected up front.
            #[allow(unused_mut)]
            let mut builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Chorus")
                    // Mobile navigates this window to services in-place: the desktop
                    // UA keeps official sign-in working in the embedded webview.
                    .user_agent(modules::services::DESKTOP_UA)
                    // History records from page loads (Started fires for
                    // loadUrl()-initiated loads on Android too, unlike
                    // on_navigation).
                    .on_page_load(move |_webview, payload| {
                        if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                            modules::browser::record_page_load(&handle, payload.url().clone());
                        }
                    });

            #[cfg(desktop)]
            {
                builder = builder
                    .inner_size(1180.0, 780.0)
                    .min_inner_size(420.0, 360.0)
                    .center();
            }

            #[cfg(mobile)]
            for script in modules::blocker::home_window_scripts() {
                builder = builder.initialization_script(&script);
            }

            builder.build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            modules::browser::open_browser,
            modules::browser::browser_state,
            modules::browser::browser_history_clear,
            modules::browser::shortcut_add,
            modules::browser::shortcut_remove,
            modules::browser::browser_favicon,
            modules::browser::browser_load_url,
            modules::providers::youtube::youtube_home,
            modules::providers::youtube::youtube_search,
            modules::providers::youtube::youtube_watch,
            modules::providers::music::music_home,
            modules::providers::music::music_search,
            modules::providers::music::music_play,
            modules::providers::spotify::spotify_status,
            modules::providers::spotify::spotify_connect,
            modules::providers::spotify::spotify_save_client_id,
            modules::providers::spotify::spotify_search,
            modules::providers::spotify::spotify_new_releases,
            modules::providers::spotify::spotify_album_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
