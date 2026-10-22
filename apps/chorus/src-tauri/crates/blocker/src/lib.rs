//! Ad/track blocking data and injected scripts for every embedded service.
//!
//! Layer 1 — network rules: `WKContentRuleList` JSON (the Safari
//! content-blocker engine) cancels ad and tracking requests before they hit
//! the network; the macOS installer lives in the app's `modules::blocker`.
//!
//! Layer 2 — injected scripts (all platforms): `fetch`/`XMLHttpRequest`
//! patching as a fallback network filter, cosmetic CSS to remove ad slots and
//! upsell banners, an overlay-ad closer for YouTube, SponsorBlock
//! integration that skips sponsor/self-promo segments, and the Chorus
//! Browser chrome (floating bottom navigation).
//!
//! Services are keyed by slug (`"youtube"`, `"youtube-music"`,
//! `"spotify"`) — the same slugs `services::Kind::slug()` produces — and the
//! scripts receive Chorus's home origin explicitly: this crate is
//! Tauri-free and knows nothing about the app's module tree.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

#[cfg(test)]
mod generic_filter_tests;

// ---------------------------------------------------------------------------
// Network rule lists (WKContentRuleList JSON)
// ---------------------------------------------------------------------------

/// Network rule list (WKContentRuleList JSON) for a service slug, or
/// `None` for an unknown slug.
pub fn rule_list_json(slug: &str) -> Option<&'static str> {
    match slug {
        "youtube" | "youtube-music" => Some(YOUTUBE_RULES),
        "spotify" => Some(SPOTIFY_RULES),
        _ => None,
    }
}

const YOUTUBE_RULES: &str = r#"[
  {"trigger":{"url-filter":"doubleclick\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"googleadservices\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"googlesyndication\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"googletagservices\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"(^|\\.)2mdn\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"youtube(-nocookie)?\\.com/api/stats/ads"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"youtube(-nocookie)?\\.com/pagead/"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"ytimg\\.com/pagead/"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"youtube(-nocookie)?\\.com/get_midroll_info"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"youtube(-nocookie)?\\.com/ptracking"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"googlevideo\\.com/videoplayback.*adformat="},"action":{"type":"block"}},
  {"trigger":{"url-filter":"youtube\\.com/generate_204.*adformat"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"adnxs\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"criteo\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"criteo\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"taboola\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"outbrain\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"adform\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"advertising\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":".*","if-domain":"*youtube.com"},"action":{"type":"css-display-none","selector":"ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytd-inline-survey-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-compact-promoted-video-renderer,ytd-player-legacy-desktop-watch-ads-renderer,ytd-mealbar-promo-renderer,#masthead-ad,#player-ads,.ytp-ad-overlay-container,.ytp-ad-text-overlay,.ytp-ad-module,.ytp-ad-player-overlay,ytmusic-ad-slot-renderer,ytmusic-banner-promo-renderer"}}
]"#;

const SPOTIFY_RULES: &str = r#"[
  {"trigger":{"url-filter":"adeventtracker\\.spotify\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"ads-fa\\.spotify\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"eventcaster\\.spotify\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"spotify\\.com/ad-service/"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"spotify\\.com/ads/"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"spotify(cdn)?\\.com/audio-ads"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"audio-ads-streaming\\.d\\.spotify\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"gabo-receiver-gabo\\.spotify\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"adnxs\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"criteo\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"criteo\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"taboola\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"outbrain\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"adform\\.net"},"action":{"type":"block"}},
  {"trigger":{"url-filter":"advertising\\.com"},"action":{"type":"block"}},
  {"trigger":{"url-filter":".*","if-domain":"*spotify.com"},"action":{"type":"css-display-none","selector":"[data-testid=\"ad-slot-container\"],[data-testid=\"ad-slot\"],[data-testid=\"sponsor-container\"],.main-leaderboardComponent-container,#ads-container,.sponsor-container,[aria-label=\"Advertisement\"],[data-ad-slot]"}}
]"#;

// ---------------------------------------------------------------------------
// Injected scripts
// ---------------------------------------------------------------------------

/// Script injected into every service webview (document start).
/// Script injected into every service webview (document start) for a
/// service slug, or `None` for an unknown slug. `home` is Chorus's own
/// origin, pinned into the browser chrome.
pub fn initialization_script(slug: &str, home: &str) -> Option<String> {
    let mut s = String::with_capacity(20 * 1024);
    match slug {
        "youtube" | "youtube-music" => {
            s.push_str(&js_core(YT_BLOCK_RE, YT_CSS));
            s.push_str(JS_YT_EXTRA);
            s.push_str(JS_SPONSORBLOCK);
        }
        "spotify" => {
            s.push_str(&js_core(SPOTIFY_BLOCK_RE, SPOTIFY_CSS));
        }
        _ => return None,
    }
    s.push_str(&browser_chrome_script(home));
    Some(s)
}

/// Chorus Browser chrome + home-window scripts for mobile (the main webview
/// navigates to services in place, so the chrome self-gates on home origin).
/// Chorus Browser chrome + home-window scripts for mobile (the main
/// webview navigates to services in place, so the chrome self-gates on
/// `home`).
pub fn home_window_scripts(home: &str) -> Vec<String> {
    let mut s = String::with_capacity(24 * 1024);
    s.push_str(&js_core(COMBINED_BLOCK_RE, COMBINED_CSS));
    s.push_str(JS_YT_EXTRA);
    s.push_str(JS_SPONSORBLOCK);
    vec![s, browser_chrome_script(home)]
}

/// Injects `window.CHORUS_HOME` + the Chorus Browser chrome: a floating
/// bottom navigation with Home, Reload, Back, and Forward actions.
pub fn browser_chrome_script(home: &str) -> String {
    let mut s = String::with_capacity(2048);
    s.push_str("window.CHORUS_HOME=");
    s.push_str(
        &serde_json::to_string(home).unwrap_or_else(|_| "\"http://tauri.localhost\"".to_string()),
    );
    s.push(';');
    s.push_str(JS_BROWSER_CHROME);
    s
}

// -- core template pieces (assembled by `js_core`, no format! braces) --------

const JS_HEAD: &str = r##"(function () {
  if (window.__CHORUS__) return;
  try { Object.defineProperty(window, '__CHORUS__', { value: true }); } catch (e) {}
  var BLOCK_RE = "##;

const JS_MID: &str = r##";
  function blocked(url) { try { return BLOCK_RE.test(url); } catch (e) { return false; } }
  // --- network filter fallback: fetch ---
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init) {
      try {
        var u = typeof input === 'string' ? input : (input && input.url);
        if (u && blocked(String(u))) return Promise.resolve(new Response(null, { status: 204 }));
      } catch (e) {}
      return _fetch.apply(this, arguments);
    };
  }
  // --- network filter fallback: XHR ---
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (url && blocked(String(url))) url = 'data:text/plain,';
    var args = Array.prototype.slice.call(arguments);
    args[1] = url;
    return _open.apply(this, args);
  };
  // --- cosmetic cleanup ---
  var CSS = '"##;

const JS_TAIL: &str = r##"';
  function addStyle() {
    try {
      var el = document.createElement('style');
      el.id = 'chorus-blocker-css';
      el.textContent = CSS;
      (document.head || document.documentElement).appendChild(el);
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addStyle);
  } else {
    addStyle();
  }
})();
"##;

fn js_core(block_re: &str, css: &str) -> String {
    let mut s = String::with_capacity(8 * 1024);
    s.push_str(JS_HEAD);
    s.push_str(block_re);
    s.push_str(JS_MID);
    s.push_str(css);
    s.push_str(JS_TAIL);
    s
}

// -- per-service regexes & selectors -----------------------------------------

const YT_BLOCK_RE: &str = r##"/doubleclick\.net|googleadservices\.com|googlesyndication\.com|googletagservices\.com|(^|\.)2mdn\.net|\/api\/stats\/ads|youtube(-nocookie)?\.com\/pagead\/|ytimg\.com\/pagead\/|get_midroll_info|youtube\.com\/ptracking|videoplayback.*adformat=|googlevideo\.com\/videoplayback.*ad_type=|adnxs\.com|criteo\.com|criteo\.net|taboola\.com|outbrain\.com|adform\.net|advertising\.com/i"##;

const YT_CSS: &str = r##"ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytd-inline-survey-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-compact-promoted-video-renderer,ytd-player-legacy-desktop-watch-ads-renderer,ytd-mealbar-promo-renderer,#masthead-ad,#player-ads,.ytp-ad-overlay-container,.ytp-ad-text-overlay,.ytp-ad-module,.ytp-ad-player-overlay,ytmusic-ad-slot-renderer,ytmusic-banner-promo-renderer"##;

const SPOTIFY_BLOCK_RE: &str = r##"/adeventtracker\.spotify\.com|ads-fa\.spotify\.com|eventcaster\.spotify\.com|spotify\.com\/ad-service\/|spotify\.com\/ads\/|spotify(cdn)?\.com\/audio-ads|audio-ads-streaming\.d\.spotify\.com|gabo-receiver-gabo\.spotify\.com|adnxs\.com|criteo\.com|criteo\.net|taboola\.com|outbrain\.com|adform\.net|advertising\.com/i"##;

const SPOTIFY_CSS: &str = r##"[data-testid="ad-slot-container"],[data-testid="ad-slot"],[data-testid="sponsor-container"],.main-leaderboardComponent-container,#ads-container,.sponsor-container,[aria-label="Advertisement"],[data-ad-slot]"##;

const COMBINED_BLOCK_RE: &str = r##"/doubleclick\.net|googleadservices\.com|googlesyndication\.com|googletagservices\.com|(^|\.)2mdn\.net|\/api\/stats\/ads|youtube(-nocookie)?\.com\/pagead\/|ytimg\.com\/pagead\/|get_midroll_info|youtube\.com\/ptracking|videoplayback.*adformat=|adeventtracker\.spotify\.com|ads-fa\.spotify\.com|eventcaster\.spotify\.com|spotify\.com\/ad-service\/|spotify\.com\/ads\/|spotify(cdn)?\.com\/audio-ads|audio-ads-streaming\.d\.spotify\.com|gabo-receiver-gabo\.spotify\.com|adnxs\.com|criteo\.com|criteo\.net|taboola\.com|outbrain\.com|adform\.net|advertising\.com/i"##;

const COMBINED_CSS: &str = r##"ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytd-inline-survey-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-compact-promoted-video-renderer,ytd-player-legacy-desktop-watch-ads-renderer,ytd-mealbar-promo-renderer,#masthead-ad,#player-ads,.ytp-ad-overlay-container,.ytp-ad-text-overlay,.ytp-ad-module,.ytp-ad-player-overlay,ytmusic-ad-slot-renderer,ytmusic-banner-promo-renderer,[data-testid="ad-slot-container"],[data-testid="ad-slot"],[data-testid="sponsor-container"],.main-leaderboardComponent-container,#ads-container,.sponsor-container,[aria-label="Advertisement"],[data-ad-slot]"##;

// -- YouTube-only extras: close overlay ads aggressively ----------------------

const JS_YT_EXTRA: &str = r##"(function () {
  setInterval(function () {
    try {
      var closer = document.querySelector('.ytp-ad-overlay-close-button');
      if (closer) closer.click();
      var skip = document.querySelector('.ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (skip) skip.click();
    } catch (e) {}
  }, 800);
})();
"##;

// -- SponsorBlock (YouTube + YouTube Music) -----------------------------------
// Community-maintained database: https://sponsor.ajay.app
// Auto-skips sponsor reads, self-promos, interaction reminders, intros,
// outros, recaps and filler — with a small toast for feedback.

const JS_SPONSORBLOCK: &str = r##"(function () {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;
  if (window.__CHORUS_SPONSORBLOCK__) return;
  try { Object.defineProperty(window, '__CHORUS_SPONSORBLOCK__', { value: true }); } catch (e) {}
  var CATS = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "filler"];
  var LABELS = {
    sponsor: "sponsor", selfpromo: "self-promo", interaction: "interaction",
    intro: "intro", outro: "outro", preview: "recap", filler: "filler"
  };
  var segments = [];
  var currentId = null;

  function toast(msg) {
    try {
      if (!document.body) return;
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);'
        + 'background:rgba(15,17,23,.92);color:#fff;padding:9px 16px;border-radius:999px;'
        + 'border:1px solid rgba(255,255,255,.14);font:600 13px/1 system-ui,-apple-system,sans-serif;'
        + 'z-index:2147483647;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.45);'
        + 'opacity:0;transition:opacity .2s';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = '1'; });
      setTimeout(function () {
        t.style.opacity = '0';
        setTimeout(function () { t.remove(); }, 300);
      }, 2200);
    } catch (e) {}
  }

  function videoId() {
    try {
      var u = new URL(location.href);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      var m = u.pathname.match(/\/(embed|shorts|v)\/([\w-]{11})/);
      return m ? m[2] : null;
    } catch (e) { return null; }
  }

  function load(id) {
    segments = [];
    var url = 'https://sponsor.ajay.app/api/skipSegments?videoID='
      + encodeURIComponent(id)
      + '&categories=' + encodeURIComponent(JSON.stringify(CATS));
    fetch(url).then(function (r) { return r.ok ? r.json() : []; }).then(function (j) {
      segments = Array.isArray(j) ? j : [];
    }).catch(function () { segments = []; });
  }

  setInterval(function () {
    var id = videoId();
    if (id && id !== currentId) { currentId = id; load(id); }
    if (!segments.length) return;
    var video = document.querySelector('video');
    if (!video || video.paused || !isFinite(video.currentTime)) return;
    var t = video.currentTime;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (t >= seg.segment[0] && t < seg.segment[1] - 0.2) {
        try {
          video.currentTime = seg.segment[1];
          toast('Chorus \u00b7 skipped ' + (LABELS[seg.category] || seg.category));
        } catch (e) {}
        break;
      }
    }
  }, 500);
})();
"##;

// -- Chorus Browser chrome -----------------------------------------------------
// Floating bottom navigation over service pages: Home, Reload, Back, Forward.
// It stays dumb on purpose — Back/Forward use the page's own history API and
// Reload uses the engine's reload, so no IPC is involved. Injected into service
// pages on all platforms.

const JS_BROWSER_CHROME: &str = r##"(function () {
  if (window.top !== window) return;
  if (window.__CHORUS_CHROME__) return;
  try { Object.defineProperty(window, '__CHORUS_CHROME__', { value: true }); } catch (e) {}
  var HOME = window.CHORUS_HOME || 'http://tauri.localhost';

  function ready() {
    if (location.origin === HOME) return;
    if (document.getElementById('chorus-float-nav')) return;

    var style = document.createElement('style');
    style.textContent = '#chorus-float-nav button:hover,#chorus-float-nav button:focus-visible'
      + '{background:rgba(255,255,255,.08);color:#fff}'
      + '#chorus-float-nav button:active{background:rgba(255,255,255,.16);color:#fff}';
    (document.head || document.documentElement).appendChild(style);

    var nav = document.createElement('nav');
    nav.id = 'chorus-float-nav';
    nav.setAttribute('aria-label', 'Chorus navigation');
    nav.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);'
      + 'bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483646;'
      + 'display:flex;align-items:stretch;gap:2px;width:90%;max-width:640px;'
      + 'background:rgba(15,17,23,.92);'
      + 'border:1px solid rgba(255,255,255,.14);border-radius:26px;padding:6px;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.5);backdrop-filter:blur(12px);'
      + 'font:500 10px/1 system-ui,sans-serif;color:#98a1b3';

    // Service pages (youtube.com, spotify.com) enforce Trusted Types, so icons
    // are built from path data with createElementNS — never HTML strings.
    function icon(paths) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '22');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < paths.length; i++) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', paths[i]);
        svg.appendChild(p);
      }
      return svg;
    }
    function tab(id, label, paths, fn) {
      var b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.style.cssText = 'background:transparent;border:0;color:inherit;display:flex;'
        + 'flex-direction:column;align-items:center;justify-content:center;gap:4px;'
        + 'flex:1;padding:8px 0 7px;border-radius:20px;cursor:pointer;'
        + 'font:inherit;letter-spacing:.02em;transition:background .15s,color .15s';
      var text = document.createElement('span');
      text.textContent = label;
      b.appendChild(icon(paths));
      b.appendChild(text);
      b.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        fn();
      });
      nav.appendChild(b);
    }

    tab('chorus-nav-home', 'Home', ['M3 10.5 12 3l9 7.5', 'M5 9.7V21h14V9.7'],
      function () { window.location.assign(HOME + '/#/'); });
    tab('chorus-nav-reload', 'Reload',
      ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
      function () { window.location.reload(); });
    tab('chorus-nav-back', 'Back', ['M15 18l-6-6 6-6'],
      function () { window.history.back(); });
    tab('chorus-nav-forward', 'Forward', ['M9 18l6-6-6-6'],
      function () { window.history.forward(); });

    (document.body || document.documentElement).appendChild(nav);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_lists_key_by_service_slug() {
        assert!(rule_list_json("youtube").is_some());
        assert!(rule_list_json("youtube-music").is_some());
        assert!(rule_list_json("spotify").is_some());
        assert_eq!(rule_list_json("unknown"), None);
    }

    #[test]
    fn initialization_script_varies_by_slug_and_rejects_unknown() {
        let yt = initialization_script("youtube", "http://h").expect("yt");
        assert!(yt.contains("__CHORUS_SPONSORBLOCK__"));
        let sp = initialization_script("spotify", "http://h").expect("sp");
        assert!(!sp.contains("__CHORUS_SPONSORBLOCK__"));
        assert_eq!(initialization_script("unknown", "http://h"), None);
    }

    #[test]
    fn chrome_script_pins_home_origin() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(s.starts_with("window.CHORUS_HOME=\"http://tauri.localhost\";"));
    }

    #[test]
    fn chrome_script_has_the_four_nav_tabs() {
        let s = browser_chrome_script("tauri://localhost");
        for id in [
            "chorus-nav-home",
            "chorus-nav-reload",
            "chorus-nav-back",
            "chorus-nav-forward",
        ] {
            assert!(s.contains(id), "missing nav tab #{id}");
        }
        for label in ["Home", "Reload", "Back", "Forward"] {
            assert!(
                s.contains(&format!("'{label}'")),
                "missing tab label {label}"
            );
        }
    }

    #[test]
    fn chrome_script_nav_spans_90_percent_of_the_screen() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(
            s.contains("width:90%"),
            "nav must span 90% of the viewport width"
        );
        assert!(
            s.contains("flex:1"),
            "tabs must stretch to fill the wider nav"
        );
    }

    #[test]
    fn chrome_script_tabs_wire_browser_actions() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(
            s.contains("window.location.reload()"),
            "reload tab must reload the page"
        );
        assert!(
            s.contains("window.history.back()"),
            "back tab must use page history"
        );
        assert!(
            s.contains("window.history.forward()"),
            "forward tab must use page history"
        );
        assert!(s.contains("HOME + '/#/'"), "home tab must return to Chorus");
    }

    #[test]
    fn chrome_script_has_no_legacy_nav_surfaces() {
        let s = browser_chrome_script("http://tauri.localhost");
        for legacy in [
            "chorus-nav-search",
            "chorus-nav-history",
            "chorus-nav-profile",
            "chorus-nav-search-panel",
            "chorus-nav-search-input",
        ] {
            assert!(
                !s.contains(legacy),
                "legacy nav surface #{legacy} must be gone"
            );
        }
    }

    #[test]
    fn chrome_script_self_gates_on_home_origin() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(s.contains("__CHORUS_CHROME__"));
        assert!(s.contains("location.origin === HOME"));
    }

    #[test]
    fn chrome_script_only_runs_in_the_top_level_frame() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(
            s.contains("window.top !== window"),
            "browser chrome must not be injected into embedded frames"
        );
    }

    #[test]
    fn chrome_script_is_trusted_types_safe() {
        let s = browser_chrome_script("http://tauri.localhost");
        // youtube.com / spotify.com serve `require-trusted-types-for 'script'`;
        // any innerHTML assignment throws there and would kill the chrome.
        assert!(!s.contains("innerHTML"));
    }

    #[test]
    fn chrome_script_drops_the_browser_toolbar() {
        let s = browser_chrome_script("http://tauri.localhost");
        assert!(!s.contains("Browser back"), "toolbar pill must be gone");
        assert!(!s.contains("Reload page"), "toolbar pill must be gone");
        assert!(!s.contains("chorus-browser-host"));
    }
}
