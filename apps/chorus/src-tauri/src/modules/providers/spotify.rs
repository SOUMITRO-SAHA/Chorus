//! Spotify provider — official Web API with OAuth 2.0 Authorization Code +
//! PKCE (the documented desktop-app flow). Tokens live in the app data dir.
//!
//! Catalog search/browse works once connected. Full-track native playback
//! requires Spotify's DRM (Web Playback SDK — roadmap); 30s previews play
//! where `preview_url` is provided.

use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::shared::domain::{MediaItem, Shelf};

const API: &str = "https://api.spotify.com/v1";
const ACCOUNTS: &str = "https://accounts.spotify.com";
const REDIRECT_URI: &str = "http://127.0.0.1:8765/callback";
const SCOPES: &str = "user-read-private user-read-email";

#[tauri::command]
pub async fn spotify_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<SpotifyStatus, String> {
    status(&app).await
}

#[tauri::command]
pub async fn spotify_connect<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    connect(app).await
}

#[tauri::command]
pub async fn spotify_save_client_id<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    client_id: String,
) -> Result<(), String> {
    save_client_id(&app, &client_id)
}

#[tauri::command]
pub async fn spotify_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    query: String,
) -> Result<Vec<MediaItem>, String> {
    search(&app, &query).await
}

#[tauri::command]
pub async fn spotify_new_releases<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<Shelf>, String> {
    new_releases(&app).await
}

#[tauri::command]
pub async fn spotify_album_tracks<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    album_id: String,
) -> Result<Vec<MediaItem>, String> {
    album_tracks(&app, &album_id).await
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct TokenStore {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    expires_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatus {
    pub configured: bool,
    pub connected: bool,
    pub display_name: Option<String>,
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("spotify http client")
}

// -- config / token storage ---------------------------------------------------

fn data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn client_id<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Option<String>, String> {
    let path = data_dir(app)?.join("chorus-spotify.json");
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Ok(None);
    };
    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(v["client_id"]
        .as_str()
        .map(str::to_string)
        .filter(|s| !s.is_empty()))
}

fn read_tokens<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<TokenStore> {
    let path = data_dir(app).ok()?.join("chorus-spotify-token.json");
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_tokens<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    tokens: &TokenStore,
) -> Result<(), String> {
    let path = data_dir(app)?.join("chorus-spotify-token.json");
    let json = serde_json::to_string_pretty(tokens).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

async fn access_token<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let tokens = read_tokens(app).ok_or("Not connected to Spotify")?;

    if now + 60 < tokens.expires_at {
        return Ok(tokens.access_token);
    }

    // refresh
    let client_id = client_id(app)?.ok_or("Spotify not configured")?;
    let resp = http()
        .post(format!("{ACCOUNTS}/api/token"))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let access = json["access_token"]
        .as_str()
        .ok_or_else(|| format!("token refresh failed: {json}"))?
        .to_string();
    let expires_in = json["expires_in"].as_u64().unwrap_or(3600);
    let updated = TokenStore {
        access_token: access.clone(),
        refresh_token: if json["refresh_token"].is_string() {
            json["refresh_token"].as_str().unwrap().to_string()
        } else {
            tokens.refresh_token
        },
        expires_at: now + expires_in,
    };
    write_tokens(app, &updated)?;
    Ok(access)
}

// -- auth (PKCE + loopback redirect) -------------------------------------------

pub async fn status<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<SpotifyStatus, String> {
    let configured = client_id(app)?.is_some();
    let mut display_name = None;
    let mut connected = false;
    if read_tokens(app).is_some()
        && let Ok(token) = access_token(app).await
    {
        let me = http()
            .get(format!("{API}/me"))
            .bearer_auth(&token)
            .send()
            .await;
        if let Ok(resp) = me
            && let Ok(me) = resp.json::<Value>().await
        {
            display_name = me["display_name"].as_str().map(str::to_string);
        }
        connected = true;
    }
    Ok(SpotifyStatus {
        configured,
        connected,
        display_name,
    })
}

/// Open the system browser for consent, capture the loopback redirect code,
/// exchange it for tokens.
pub async fn connect<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let client_id = client_id(&app)?.ok_or(
        "Spotify is not configured. Create a free app at developer.spotify.com/dashboard, enable the Web API, add redirect URI http://127.0.0.1:8765/callback, then save the Client ID in Chorus.",
    )?;

    // PKCE
    let verifier_bytes: [u8; 64] = rand_bytes();
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let auth_url = format!(
        "{ACCOUNTS}/authorize?response_type=code&client_id={client_id}&scope={SCOPES}&redirect_uri={REDIRECT_URI}&code_challenge_method=S256&code_challenge={challenge}"
    );

    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("could not open browser: {e}"))?;

    // Loopback listener: wait for ?code=
    let code = tokio::task::spawn_blocking(loopback_code)
        .await
        .map_err(|e| e.to_string())??;

    let resp = http()
        .post(format!("{ACCOUNTS}/api/token"))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let access = json["access_token"]
        .as_str()
        .ok_or_else(|| format!("token exchange failed: {json}"))?
        .to_string();
    let refresh = json["refresh_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let expires_in = json["expires_in"].as_u64().unwrap_or(3600);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    write_tokens(
        &app,
        &TokenStore {
            access_token: access,
            refresh_token: refresh,
            expires_at: now + expires_in,
        },
    )?;

    Ok("Connected".into())
}

pub fn save_client_id<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Result<(), String> {
    let path = data_dir(app)?.join("chorus-spotify.json");
    let json = serde_json::json!({ "client_id": id.trim() });
    std::fs::write(
        path,
        serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// 64 random bytes for the PKCE verifier.
fn rand_bytes() -> [u8; 64] {
    let mut buf = [0u8; 64];
    for b in buf.iter_mut() {
        *b = rand::random::<u8>();
    }
    buf
}

/// Bind 127.0.0.1:8765 and wait for the OAuth redirect; returns `?code=`.
fn loopback_code() -> Result<String, String> {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:8765").map_err(|e| {
        format!("cannot listen on 127.0.0.1:8765 (is another auth in progress?): {e}")
    })?;
    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("loopback accept failed: {e}"))?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    let target = req.split_whitespace().nth(1).unwrap_or("");
    let code = target
        .split("code=")
        .nth(1)
        .and_then(|rest| rest.split('&').next())
        .map(|c| c.to_string())
        .ok_or("no authorization code in redirect")?;

    let page = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body style='font-family:sans-serif;background:#0b0e14;color:#fff;display:grid;place-items:center;height:100vh'><h1>Chorus is connected to Spotify ✓</h1><p style='color:#98a1b3'>You can close this tab.</p></body></html>";
    let _ = stream.write_all(page.as_bytes());
    let _ = stream.flush();
    Ok(code)
}

// -- catalog -------------------------------------------------------------------

async fn api_get<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<Value, String> {
    let token = access_token(app).await?;
    let resp = http()
        .get(format!("{API}{path}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "spotify api {path}: {status} — {}",
            json["error"]["message"].as_str().unwrap_or("error")
        ));
    }
    Ok(json)
}

fn track_to_item(t: &Value) -> Option<MediaItem> {
    let id = t["id"].as_str()?.to_string();
    let name = t["name"].as_str()?.to_string();
    let artists = t["artists"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let album = t["album"]["name"].as_str().unwrap_or_default();
    let mut item = MediaItem::new(id, name, format!("{artists} • {album}"));
    item.kind = "spotify-track".into();
    item.thumbnail = t["album"]["images"]
        .as_array()
        .and_then(|imgs| imgs.first())
        .and_then(|i| i["url"].as_str())
        .map(str::to_string);
    item.preview_url = t["preview_url"].as_str().map(str::to_string);
    item.duration = t["duration_ms"]
        .as_u64()
        .map(|ms| crate::modules::providers::youtube::fmt_duration(ms / 1000));
    Some(item)
}

pub async fn search<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    query: &str,
) -> Result<Vec<MediaItem>, String> {
    let q = urlencoding::encode(query);
    let json = api_get(app, &format!("/search?q={q}&type=track&limit=30")).await?;
    let items = json["tracks"]["items"]
        .as_array()
        .map(|arr| arr.iter().filter_map(track_to_item).collect())
        .unwrap_or_default();
    Ok(items)
}

pub async fn new_releases<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Vec<Shelf>, String> {
    let json = api_get(app, "/browse/new-releases?limit=20").await?;
    let mut items = Vec::new();
    if let Some(albums) = json["albums"]["items"].as_array() {
        for a in albums {
            let Some(id) = a["id"].as_str() else { continue };
            let name = a["name"].as_str().unwrap_or("Album");
            let artists = a["artists"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x["name"].as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let mut item = MediaItem::new(id, name, artists);
            item.kind = "album".into();
            item.thumbnail = a["images"]
                .as_array()
                .and_then(|imgs| imgs.first())
                .and_then(|i| i["url"].as_str())
                .map(str::to_string);
            items.push(item);
        }
    }
    Ok(vec![Shelf {
        title: "New releases".into(),
        items,
    }])
}

/// Tracks of an album (so albums are actually playable from the UI).
pub async fn album_tracks<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    album_id: &str,
) -> Result<Vec<MediaItem>, String> {
    let json = api_get(app, &format!("/albums/{album_id}")).await?;
    let artists = json["artists"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x["name"].as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let items = json["tracks"]["items"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    let mut item = track_to_item(&serde_json::json!({
                        "id": t["id"], "name": t["name"], "artists": [{"name": artists}],
                        "album": {"name": json["name"], "images": json["images"]},
                        "preview_url": t["preview_url"], "duration_ms": t["duration_ms"],
                    }))?;
                    item.kind = "spotify-track".into();
                    Some(item)
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(items)
}
