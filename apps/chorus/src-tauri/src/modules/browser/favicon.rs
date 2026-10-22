//! Website favicon discovery and download for custom shortcut tiles.
//!
//! The renderer never touches the network: this module fetches the page and
//! its icon, then returns a self-contained `data:` URL. Every failure maps to
//! `None` so the client can fall back to Chorus's default mark.

use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use reqwest::{Client, Url, header};

use crate::modules::services::DESKTOP_UA;

const MAX_HTML_BYTES: usize = 512 * 1024;
const MAX_ICON_BYTES: usize = 256 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const HTML_ACCEPT: &str = "text/html,application/xhtml+xml";

/// Fetch the best icon for `raw_url` as a `data:` URL, or `None` on failure.
///
/// Only `http(s)` pages are considered. Discovery reads the page's
/// `<link rel="icon">` / `apple-touch-icon` tags and falls back to the site's
/// `/favicon.ico`.
pub async fn fetch_icon(raw_url: &str) -> Option<String> {
    let url = Url::parse(raw_url).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }

    let client = Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(DESKTOP_UA)
        .build()
        .ok()?;

    for candidate in candidates(&client, &url).await {
        if let Some(icon) = download_icon(&client, &candidate).await {
            return Some(icon);
        }
    }
    None
}

async fn candidates(client: &Client, url: &Url) -> Vec<Url> {
    let mut found = Vec::new();
    if let Ok(response) = client
        .get(url.clone())
        .header(header::ACCEPT, HTML_ACCEPT)
        .send()
        .await
        && response.status().is_success()
    {
        let final_url = response.url().clone();
        if let Some(body) = read_capped(response, MAX_HTML_BYTES).await {
            let html = String::from_utf8_lossy(&body);
            found.extend(icon_links(&html, &final_url).into_iter().take(1));
        }
    }
    if let Ok(fallback) = url.join("/favicon.ico")
        && !found.contains(&fallback)
    {
        found.push(fallback);
    }
    found
}

async fn download_icon(client: &Client, url: &Url) -> Option<String> {
    let response = client.get(url.clone()).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = read_capped(response, MAX_ICON_BYTES).await?;
    if bytes.is_empty() {
        return None;
    }
    let mime = image_mime(content_type.as_deref(), &bytes)?;
    Some(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

async fn read_capped(mut response: reqwest::Response, limit: usize) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len() + chunk.len() > limit {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    Some(body)
}

fn image_mime(content_type: Option<&str>, bytes: &[u8]) -> Option<String> {
    if let Some(value) = content_type {
        let mime = value
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if mime.starts_with("image/") && !looks_like_html(bytes) {
            return Some(mime);
        }
    }
    sniff_image_mime(bytes)
}

fn sniff_image_mime(bytes: &[u8]) -> Option<String> {
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        "image/x-icon"
    } else if looks_like_svg(bytes) {
        "image/svg+xml"
    } else {
        return None;
    };
    Some(mime.to_string())
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
    head.to_ascii_lowercase().contains("<svg")
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
    head.to_ascii_lowercase().contains("<html")
}

/// Icon URLs from `<link>` tags, best candidate first.
fn icon_links(html: &str, base: &Url) -> Vec<Url> {
    let mut ranked: Vec<(u8, Url)> = Vec::new();
    for attrs in link_tags(html) {
        let rel = attribute(&attrs, "rel")
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let Some(href) = attribute(&attrs, "href") else {
            continue;
        };
        let tokens: Vec<&str> = rel.split_ascii_whitespace().collect();
        let rank = if tokens.contains(&"apple-touch-icon") {
            0
        } else if tokens.contains(&"icon") {
            1
        } else {
            continue;
        };
        let Ok(resolved) = base.join(href.trim()) else {
            continue;
        };
        if !matches!(resolved.scheme(), "http" | "https") {
            continue;
        }
        ranked.push((rank, resolved));
    }
    ranked.sort_by_key(|(rank, _)| *rank);
    ranked.into_iter().map(|(_, url)| url).collect()
}

fn attribute<'a>(attrs: &'a [(String, String)], name: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

fn link_tags(html: &str) -> Vec<Vec<(String, String)>> {
    let lower = html.to_ascii_lowercase();
    let mut tags = Vec::new();
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("<link") {
        let start = cursor + found;
        let after = start + "<link".len();
        let boundary = lower[after..].chars().next();
        if !matches!(boundary, Some(c) if c.is_ascii_whitespace() || c == '>') {
            cursor = after;
            continue;
        }
        let Some(close) = lower[after..].find('>') else {
            break;
        };
        let end = after + close;
        tags.push(parse_attributes(&html[after..end]));
        cursor = end + 1;
    }
    tags
}

fn parse_attributes(tag: &str) -> Vec<(String, String)> {
    let bytes = tag.as_bytes();
    let mut attrs = Vec::new();
    let mut i = 0;

    while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'/' {
        i += 1;
    }

    while i < bytes.len() {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }

        let name_start = i;
        while i < bytes.len()
            && !bytes[i].is_ascii_whitespace()
            && bytes[i] != b'='
            && bytes[i] != b'/'
        {
            i += 1;
        }
        let name = String::from_utf8_lossy(&bytes[name_start..i]).to_ascii_lowercase();

        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }

        let mut value = String::new();
        if i < bytes.len() && bytes[i] == b'=' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
                let quote = bytes[i];
                i += 1;
                let value_start = i;
                while i < bytes.len() && bytes[i] != quote {
                    i += 1;
                }
                value = String::from_utf8_lossy(&bytes[value_start..i]).to_string();
                if i < bytes.len() {
                    i += 1;
                }
            } else {
                let value_start = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                value = String::from_utf8_lossy(&bytes[value_start..i]).to_string();
            }
        }

        if !name.is_empty() {
            attrs.push((name, value));
        }
    }
    attrs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://example.com/news/").expect("base url")
    }

    #[test]
    fn finds_icon_links_and_resolves_relative_hrefs() {
        let html = r#"<html><head><link rel="icon" href="../assets/favicon.png"></head></html>"#;
        let links = icon_links(html, &base());
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].as_str(), "https://example.com/assets/favicon.png");
    }

    #[test]
    fn prefers_apple_touch_icon() {
        let html = r#"
            <link rel="icon" href="/favicon.ico">
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        "#;
        let links = icon_links(html, &base());
        assert_eq!(
            links[0].as_str(),
            "https://example.com/apple-touch-icon.png"
        );
        assert_eq!(links[1].as_str(), "https://example.com/favicon.ico");
    }

    #[test]
    fn parses_single_quoted_and_unquoted_attributes() {
        let html = "<LINK rel='shortcut icon' href=/favicon.ico>";
        let links = icon_links(html, &base());
        assert_eq!(links[0].as_str(), "https://example.com/favicon.ico");
    }

    #[test]
    fn ignores_non_icon_links_and_non_http_hrefs() {
        let html = r#"
            <link rel="stylesheet" href="/app.css">
            <link rel="icon" href="javascript:alert(1)">
            <link rel="mask-icon" href="/mask.svg">
        "#;
        assert!(icon_links(html, &base()).is_empty());
    }

    #[test]
    fn sniffs_icons_when_the_content_type_is_generic() {
        assert_eq!(
            sniff_image_mime(b"\x89PNG\r\n\x1a\nrest").as_deref(),
            Some("image/png")
        );
        assert_eq!(
            sniff_image_mime(br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#).as_deref(),
            Some("image/svg+xml")
        );
        assert!(sniff_image_mime(b"<html>404</html>").is_none());
    }

    #[test]
    fn trusts_image_content_types_and_ignores_html() {
        assert_eq!(
            image_mime(Some("image/png; charset=binary"), b"not really a png").as_deref(),
            Some("image/png")
        );
        assert!(image_mime(Some("text/html"), b"<html>404</html>").is_none());
        assert!(image_mime(Some("image/png"), b"<!doctype html><html>404</html>").is_none());
    }
}
