//! Chorus Browser — our own single-site browser environment: injected
//! chrome and persistence. One website is active at a time — no tabs, no
//! parallel sessions — so the engine's own back stack *is* the session and
//! this module keeps only what the home screen renders. Persistence lives
//! in the standalone `browser-store` crate.

use std::sync::Arc;

use tauri::{AppHandle, Manager, State};
#[cfg(not(mobile))]
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(not(mobile))]
use crate::modules::blocker;
use crate::modules::services;

mod favicon;

pub use browser_store::{BrowserSnapshot, Shortcut};

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Initialize browser state (SQLite). Page-load hooks are installed on the
/// windows in `lib.rs` / `open_browser` and call [`record_page_load`].
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db = Arc::new(browser_store::Store::open(
        &dir.join("browser-store.sqlite3"),
    )?);
    app.manage(db);
    Ok(())
}

/// Whether a loaded URL belongs in history/session: real http(s) documents
/// that are not Chorus's own origin — the injected chrome routes home by
/// URL, and those loads (plus the dev server) must not pollute history.
fn should_record(url: &tauri::Url) -> bool {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }
    let app_origin = match url.host_str() {
        Some("tauri.localhost") => true,
        Some("localhost") | Some("127.0.0.1") => url.port() == Some(1420),
        _ => false,
    };
    !app_origin
}

fn parse_http_url(raw: &str) -> Result<tauri::Url, String> {
    let url = raw
        .parse::<tauri::Url>()
        .map_err(|error| format!("invalid URL: {error}"))?;
    if matches!(url.scheme(), "http" | "https") {
        Ok(url)
    } else {
        Err("only http(s) URLs are supported".into())
    }
}

/// Record a committed page load on the engine side (called from every
/// window's `on_page_load` Started hook). Unlike the previous
/// `on_navigation` hook — which on Android only fires for link/JS-initiated
/// loads — this also fires for `loadUrl()`-initiated loads, so shortcut
/// opens and address-bar navigations are recorded.
pub fn record_page_load(app: &AppHandle, url: tauri::Url) {
    if !should_record(&url) {
        return;
    }
    if let Some(db) = app.try_state::<Arc<browser_store::Store>>() {
        db.history_record(
            url.as_str(),
            url.host_str().unwrap_or_default(),
            now_millis(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_http_url, should_record};

    fn url(s: &str) -> tauri::Url {
        s.parse().expect("valid url")
    }

    #[test]
    fn records_remote_pages_only() {
        assert!(should_record(&url("https://www.youtube.com/")));
        assert!(should_record(&url("https://open.spotify.com/album/x")));
        assert!(should_record(&url("http://example.com:8080/page")));
    }

    #[test]
    fn skips_non_http_schemes() {
        assert!(!should_record(&url("tauri://localhost/")));
        assert!(!should_record(&url("about:blank")));
        assert!(!should_record(&url("data:text/plain,hi")));
    }

    #[test]
    fn parses_http_schemes_case_insensitively() {
        assert_eq!(
            parse_http_url("Http://example.com").unwrap().scheme(),
            "http"
        );
        assert_eq!(
            parse_http_url("HTTPS://example.com").unwrap().scheme(),
            "https"
        );
    }

    #[test]
    fn rejects_non_http_schemes_for_browser_navigation() {
        assert!(parse_http_url("javascript:alert(1)").is_err());
        assert!(parse_http_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn skips_choruss_own_origin() {
        // Android/Windows app origin + the injected chrome's home routes.
        assert!(!should_record(&url("http://tauri.localhost/")));
        assert!(!should_record(&url(
            "http://tauri.localhost/#/?panel=history"
        )));
        // Dev server origin.
        assert!(!should_record(&url("http://localhost:1420/")));
        assert!(!should_record(&url("http://127.0.0.1:1420/youtube")));
        // Same hosts on other ports are ordinary sites.
        assert!(should_record(&url("http://localhost:8080/")));
    }
}

/// Everything the browser home screen renders.
#[tauri::command]
pub async fn browser_state(
    db: State<'_, Arc<browser_store::Store>>,
) -> Result<BrowserSnapshot, String> {
    let db = Arc::clone(&db);
    tauri::async_runtime::spawn_blocking(move || db.snapshot())
        .await
        .map_err(|e| e.to_string())?
}

/// Erase all visited-URL history (browser menu action).
#[tauri::command]
pub async fn browser_history_clear(db: State<'_, Arc<browser_store::Store>>) -> Result<(), String> {
    let db = Arc::clone(&db);
    tauri::async_runtime::spawn_blocking(move || db.history_clear())
        .await
        .map_err(|e| e.to_string())?
}

/// Add a home-screen shortcut tile.
#[tauri::command]
pub async fn shortcut_add(
    db: State<'_, Arc<browser_store::Store>>,
    label: String,
    url: String,
    service: String,
    icon: Option<String>,
) -> Result<Shortcut, String> {
    let db = Arc::clone(&db);
    tauri::async_runtime::spawn_blocking(move || {
        db.shortcut_add(&label, &url, &service, icon.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Fetch a website's favicon as a `data:` URL for a shortcut tile.
#[tauri::command]
pub async fn browser_favicon(url: String) -> Option<String> {
    favicon::fetch_icon(&url).await
}

/// Remove a home-screen shortcut tile.
#[tauri::command]
pub async fn shortcut_remove(
    db: State<'_, Arc<browser_store::Store>>,
    id: i64,
) -> Result<(), String> {
    let db = Arc::clone(&db);
    tauri::async_runtime::spawn_blocking(move || db.shortcut_remove(id))
        .await
        .map_err(|e| e.to_string())?
}

/// Open a service inside Chorus Browser. Chorus is single-site: mobile
/// navigates the one main window in place; desktop keeps at most ONE
/// service window — opening a different service closes the old one (its
/// webview is torn down and its memory freed) because blocker profiles
/// are baked into each window's init scripts.
#[tauri::command]
pub fn open_browser(app: AppHandle, id: String) -> Result<String, String> {
    let svc = services::find(&id).ok_or_else(|| format!("unknown service '{id}'"))?;

    // Mobile: the single window — navigate it in place.
    #[cfg(mobile)]
    {
        let main = app
            .get_webview_window("main")
            .ok_or_else(|| "main window unavailable".to_string())?;
        let url: tauri::Url = svc.url.parse().map_err(|e| format!("{e}"))?;
        main.navigate(url).map_err(|e| e.to_string())?;
        Ok("navigated".into())
    }

    // Desktop: the singleton service window.
    #[cfg(not(mobile))]
    {
        for other in services::SERVICES {
            if let Some(window) = app.get_webview_window(other.window_label()) {
                if other.window_label() == svc.window_label() {
                    let _ = window.show();
                    let _ = window.set_focus();
                    return Ok("focused".into());
                }
                let _ = window.close();
            }
        }
        let url: tauri::Url = svc.url.parse().map_err(|e| format!("{e}"))?;
        let script = blocker::initialization_script(svc.kind)
            .ok_or_else(|| format!("no blocker profile for service '{id}'"))?;
        let hook_app = app.clone();
        let builder =
            WebviewWindowBuilder::new(&app, svc.window_label(), WebviewUrl::External(url))
                .title(svc.title)
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 320.0)
                .user_agent(services::DESKTOP_UA)
                .initialization_script(&script)
                .on_page_load(move |_webview, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                        record_page_load(&hook_app, payload.url().clone());
                    }
                });

        let window = builder.build().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        blocker::attach(&window, svc.kind);
        #[cfg(not(target_os = "macos"))]
        let _ = window;
        Ok("opened".into())
    }
}

/// Navigate the in-place browser session to a URL (LoadUrl use-case).
/// Only http(s) targets are allowed. Mobile-only: desktop has no in-place
/// browser surface yet.
#[tauri::command]
pub fn browser_load_url(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = parse_http_url(&url)?;
    #[cfg(not(mobile))]
    {
        let _ = (&app, parsed);
        Err("browser_load_url is mobile-only (no desktop in-place browser yet)".into())
    }
    #[cfg(mobile)]
    {
        match app.get_webview_window("main") {
            Some(main) => main.navigate(parsed).map_err(|e| e.to_string()),
            None => Ok(()),
        }
    }
}
