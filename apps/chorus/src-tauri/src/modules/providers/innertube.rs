//! InnerTube client — YouTube's own app API (see
//! `docs/reverse-engineering/innertube.md` for the protocol evidence).
//!
//! One shared HTTP client + cached `visitorData` per host; extraction helpers
//! shared by all providers (DRY).

use std::sync::OnceLock;
use tokio::sync::RwLock;

use serde_json::{Value, json};

use crate::shared::domain::MediaItem;

const WEB_CLIENT_VERSION: &str = "2.20250312.04.00";
const REMIX_CLIENT_VERSION: &str = "1.20250312.01.00";
const VR_CLIENT_VERSION: &str = "1.60.19";
const CONSENT_COOKIE: &str = "SOCS=CAI; CONSENT=YES+cb.20210328-17-p0.en+FX+419";

pub const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const VR_UA: &str = "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip";

pub const YT_HOST: &str = "https://www.youtube.com";
pub const MUSIC_HOST: &str = "https://music.youtube.com";

pub struct InnerTube {
    http: reqwest::Client,
    web_visitor: RwLock<Option<String>>,
    music_visitor: RwLock<Option<String>>,
}

static IT: OnceLock<InnerTube> = OnceLock::new();

pub fn it() -> &'static InnerTube {
    IT.get_or_init(|| InnerTube {
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("reqwest client"),
        web_visitor: RwLock::new(None),
        music_visitor: RwLock::new(None),
    })
}

impl InnerTube {
    /// Bootstrap `visitorData` for a host by scraping the site root (ytcfg).
    async fn ensure_visitor(&self, music: bool) -> Option<String> {
        let (lock, host) = if music {
            (&self.music_visitor, MUSIC_HOST)
        } else {
            (&self.web_visitor, YT_HOST)
        };
        if let Some(v) = lock.read().await.clone() {
            return Some(v);
        }
        let body = self
            .http
            .get(host)
            .header("User-Agent", CHROME_UA)
            .header("Cookie", CONSENT_COOKIE)
            .send()
            .await
            .ok()?
            .text()
            .await
            .ok()?;
        let visitor = extract_visitor_data(&body)?;
        *lock.write().await = Some(visitor.clone());
        Some(visitor)
    }

    /// POST an InnerTube endpoint.
    pub async fn call(
        &self,
        host: &str,
        endpoint: &str,
        client: Value,
        client_name_header: &str,
        ua: &str,
        extra: Value,
    ) -> Result<Value, String> {
        let mut body = json!({ "context": { "client": client } });
        if let Some(obj) = extra.as_object() {
            for (k, v) in obj {
                body[k.as_str()] = v.clone();
            }
        }
        let resp = self
            .http
            .post(format!("{host}/youtubei/v1/{endpoint}?prettyPrint=false"))
            .header("Content-Type", "application/json")
            .header("User-Agent", ua)
            .header("Cookie", CONSENT_COOKIE)
            .header("X-YouTube-Client-Name", client_name_header)
            .header(
                "X-YouTube-Client-Version",
                client["clientVersion"].as_str().unwrap_or(""),
            )
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("innertube {endpoint}: {e}"))?;
        let status = resp.status();
        let json: Value = resp
            .json()
            .await
            .map_err(|e| format!("innertube {endpoint} decode: {e}"))?;
        if !status.is_success() {
            let msg = json["error"]["message"].as_str().unwrap_or("unknown error");
            return Err(format!("innertube {endpoint}: {status} — {msg}"));
        }
        Ok(json)
    }

    /// WEB client context (youtube.com), with cached visitor when available.
    pub async fn web(&self) -> (Value, String) {
        let visitor = self.ensure_visitor(false).await.unwrap_or_default();
        (
            json!({
                "clientName": "WEB",
                "clientVersion": WEB_CLIENT_VERSION,
                "hl": "en",
                "gl": "US",
                "visitorData": visitor,
            }),
            "1".into(),
        )
    }

    /// WEB_REMIX client context (YouTube Music), own visitor cache.
    pub async fn remix(&self) -> (Value, String) {
        let visitor = self.ensure_visitor(true).await.unwrap_or_default();
        (
            json!({
                "clientName": "WEB_REMIX",
                "clientVersion": REMIX_CLIENT_VERSION,
                "hl": "en",
                "gl": "US",
                "visitorData": visitor,
            }),
            "67".into(),
        )
    }

    /// ANDROID_VR client context — the stream-yielding identity.
    pub fn vr(&self) -> (Value, String) {
        (
            json!({
                "clientName": "ANDROID_VR",
                "clientVersion": VR_CLIENT_VERSION,
                "deviceMake": "Oculus",
                "deviceModel": "Quest 3",
                "osName": "Android",
                "osVersion": "12",
                "androidSdkVersion": 32,
                "hl": "en",
                "gl": "US",
            }),
            "28".into(),
        )
    }

    pub fn vr_ua(&self) -> &'static str {
        VR_UA
    }

    /// Run `player` for a video via ANDROID_VR and return the raw response.
    pub async fn player(&self, video_id: &str) -> Result<Value, String> {
        let (client, cn) = self.vr();
        self.call(
            YT_HOST,
            "player",
            client,
            &cn,
            self.vr_ua(),
            json!({ "videoId": video_id, "contentCheckOk": true, "racyCheckOk": true }),
        )
        .await
    }

    /// WEB search.
    pub async fn search(&self, query: &str) -> Result<Value, String> {
        let (client, cn) = self.web().await;
        self.call(
            YT_HOST,
            "search",
            client,
            &cn,
            CHROME_UA,
            json!({ "query": query }),
        )
        .await
    }
}

/// Pull `VISITOR_DATA` out of a YouTube HTML page / ytcfg blob.
fn extract_visitor_data(html: &str) -> Option<String> {
    let key = "\"VISITOR_DATA\":\"";
    let start = html.find(key)? + key.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    let raw = &rest[..end];
    // The value is a JSON-escaped string (may contain \u003d etc).
    serde_json::from_str::<String>(&format!("\"{raw}\"")).ok()
}

// ---------------------------------------------------------------------------
// Extraction helpers (shared by every provider — DRY)
// ---------------------------------------------------------------------------

/// Depth-first collect of all values under `key` inside a polymorphic
/// InnerTube response tree.
pub fn collect<'a>(node: &'a Value, key: &str, out: &mut Vec<&'a Value>, depth: usize) {
    if depth > 18 {
        return;
    }
    match node {
        Value::Array(items) => {
            for item in items {
                collect(item, key, out, depth + 1);
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                if k == key {
                    out.push(v);
                }
                collect(v, key, out, depth + 1);
            }
        }
        _ => {}
    }
}

pub fn collect_all<'a>(node: &'a Value, key: &str) -> Vec<&'a Value> {
    let mut out = Vec::new();
    collect(node, key, &mut out, 0);
    out
}

/// `{"runs":[{"text":"a"},{"text":"b"}]}` or `{"simpleText":"a"}` → "ab"
pub fn runs_text(node: &Value) -> Option<String> {
    if let Some(simple) = node.get("simpleText").and_then(Value::as_str) {
        return Some(simple.to_string());
    }
    let runs = node.get("runs")?.as_array()?;
    let text: String = runs
        .iter()
        .filter_map(|r| r.get("text").and_then(Value::as_str))
        .collect();
    if text.is_empty() { None } else { Some(text) }
}

/// Widest thumbnail URL from any `{thumbnails:[{url,width}...]}` shape,
/// including the music `thumbnail.musicThumbnailRenderer.thumbnail` nesting.
pub fn best_thumb(node: &Value) -> Option<String> {
    let mut thumbs = collect_all(node, "thumbnails");
    if thumbs.is_empty() {
        return None;
    }
    let best = thumbs
        .iter_mut()
        .flat_map(|t| t.as_array().expect("thumbnails array"))
        .max_by_key(|t| t.get("width").and_then(Value::as_u64).unwrap_or(0))?
        .clone();
    best.get("url").and_then(Value::as_str).map(str::to_string)
}

/// `videoRenderer` (search/browse results) → MediaItem
pub fn parse_video_renderer(v: &Value) -> Option<MediaItem> {
    let id = v.get("videoId")?.as_str()?.to_string();
    let title = v
        .get("title")
        .and_then(runs_text)
        .unwrap_or_else(|| "Untitled".into());
    let channel = v
        .get("ownerText")
        .or_else(|| v.get("longBylineText"))
        .and_then(runs_text)
        .unwrap_or_default();
    let meta: Vec<String> = ["shortViewCountText", "publishedTimeText"]
        .iter()
        .filter_map(|k| v.get(*k).and_then(runs_text))
        .collect();
    let mut item = MediaItem::new(id, title, channel.clone());
    item.duration = v.get("lengthText").and_then(runs_text);
    item.thumbnail = best_thumb(v.get("thumbnail").unwrap_or(&Value::Null));
    item.subtitle = if meta.is_empty() {
        channel
    } else {
        format!("{channel} • {}", meta.join(" • "))
    };
    Some(item)
}

/// `lockupViewModel` (the newer renderer system) → MediaItem
pub fn parse_lockup(v: &Value) -> Option<MediaItem> {
    let id = v.get("contentId")?.as_str()?.to_string();
    let content_type = v.get("contentType").and_then(Value::as_str).unwrap_or("");
    if !content_type.contains("VIDEO") && !content_type.contains("SHORT") {
        return None;
    }
    let title = v
        .pointer("/metadata/lockupMetadataViewModel/title/content")
        .and_then(Value::as_str)
        .unwrap_or("Untitled")
        .to_string();
    let subtitle = v
        .pointer("/metadata/lockupMetadataViewModel/metadata/contentMetadataViewModel/metadataRows")
        .map(|rows| {
            collect_all(rows, "text")
                .iter()
                .filter_map(|t| t.get("content").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" • ")
        })
        .unwrap_or_default();
    let mut item = MediaItem::new(id, title, subtitle);
    item.thumbnail = best_thumb(v.get("contentImage").unwrap_or(&Value::Null));
    Some(item)
}

/// `musicResponsiveListItemRenderer` (YT Music) → MediaItem
pub fn parse_music_item(v: &Value) -> Option<MediaItem> {
    let id = v
        .pointer("/playlistItemData/videoId")
        .or_else(|| {
            v.pointer(
                "/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId",
            )
        })?
        .as_str()?
        .to_string();
    let flex = |i: usize| -> Option<String> {
        v.pointer(&format!(
            "/flexColumns/{i}/musicResponsiveListItemFlexColumnRenderer/text"
        ))
        .and_then(|t| {
            let runs: String = t
                .get("runs")
                .and_then(Value::as_array)
                .map(|rs| {
                    rs.iter()
                        .filter_map(|r| r.get("text").and_then(Value::as_str))
                        .collect()
                })
                .unwrap_or_default();
            if runs.is_empty() {
                t.get("simpleText")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            } else {
                Some(runs)
            }
        })
    };
    let title = flex(0).unwrap_or_else(|| "Untitled".into());
    let subtitle = flex(1).unwrap_or_default();
    let mut item = MediaItem::new(id, title, subtitle);
    item.kind = "song".into();
    item.thumbnail = best_thumb(v.get("thumbnail").unwrap_or(&Value::Null));
    Some(item)
}
