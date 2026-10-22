# Chorus PRD — the streaming browser

**Every stream. One chorus. Zero ads.**

Status: direction adopted 2026-10-20. This PRD supersedes the earlier
"media app" framing. The goal is unchanged; the product is now understood,
built, and described as **a browser optimized for streaming** — not a
general-purpose browser, and not a media service.

---

## 1. Vision

Chorus is a mobile-first browser tuned for a targeted set of streaming and
reading experiences: YouTube, YouTube Music, Spotify today; other streaming
sites on demand. It loads the **official websites in an embedded,
persistent webview**, wraps them in Chorus's own chrome, and filters ad,
tracker, and sponsor traffic **client-side** — the same way Safari content
blockers, AdGuard, and uBlock Origin do for every mainstream browser.

The user signs in with their own accounts, on the service's own website,
over the service's own endpoints. Chorus hosts nothing, stores nothing, and
redistributes nothing. Every video, song, and image the user sees is served
by the origin service to the user, exactly as in any other browser — minus
the ads.

Product focus, in priority order:

1. **Streaming** — video and music sites, optimized per site.
2. **Reading** — clean, ad-free long-form reading on the same engine.
3. **AI-native (future)** — assistance layered on top of what the user is
   already watching or reading.

## 2. Why a browser (the direction change)

Chorus began as a "media app": native UIs calling provider APIs directly.
The native path still exists as an optimization layer (§3.5), but the
product identity and the legally sound default is the browser path:

|                    | Media-app framing (old)            | Streaming-browser framing (current)         |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| What we ship       | A media app with providers         | A browser with site profiles                |
| Content source     | Provider APIs we integrate         | The official websites, rendered as-is       |
| Who serves content | The app calls provider APIs        | The origin service, to the user             |
| Legal surface      | We touch internal APIs for content | We render pages the user requests           |
| Ad removal         | Feature of the app                 | Client-side filtering, a browser capability |
| Scope              | Hard-coded services                | Any streaming site, optimized on request    |

A browser is the oldest, most litigated category of client software. Browsers
fetch and render what the user asks for; the content, its licensing, and its
delivery remain entirely with the origin site. That separation — not any
technical trick — is what makes the category viable, and it is Chorus's
foundation (see §6).

## 3. Product pillars

### 3.1 Chorus Browser (the product)

- Embedded persistent webview (Tauri 2 + system webview) with Chorus's own
  chrome: home, back, reload, host indicator, and the shield.
- Sessions persist across restarts; users log in with their real accounts on
  the real site. Credentials never pass through Chorus.
- Android-first interaction model: on mobile the single main window
  navigates in place; injected **← Chorus** chrome stays reachable. Desktop
  (macOS) may open extra windows.
- Browser home is the launcher: curated streaming shortcuts, history, tabs
  (Rust/SQLite persistence — `browser_state`, `shortcut_add`,
  `shortcut_remove`, `history_record`).

### 3.2 Chorus Shield (100% ad-free, AdGuard-grade)

Zero ads is a product requirement, not a best-effort. The shield is
the moat: the better the filter stack, the less anything else matters. Three
layers today, one planned:

1. **Network-level filtering** (macOS today) — `WKContentRuleList`, the
   Safari content-blocker engine, cancels ad/tracker requests before they
   hit the wire.
2. **Injected page filter** (all platforms) — `fetch`/`XHR` patching plus
   cosmetic CSS that removes ad slots, upsell banners, and surveys at render
   time.
3. **SponsorBlock** (YouTube / YT Music) — community-driven auto-skip of
   sponsor reads, self-promos, intros/outros, recaps, interaction reminders.
4. **Network-level filtering on Android** (roadmap) —
   `WebViewClient.shouldInterceptRequest`-based request cancellation, parity
   with the macOS layer. This is the single biggest shield upgrade; it is
   what takes the shield to AdGuard-grade on the primary platform.

Shield engineering rules:

- Filter rules are data, kept in `modules/blocker/`. When a service changes
  its ad endpoints, the fix is a rules update — not a browser workaround.
- Never weaken or bypass filtering in UI code; never let a page detect and
  punish filtering without a tracked issue.
- Every shield change ships with a measurable before/after (blocked-request
  counts per site in dev builds).

### 3.3 Targeted site optimization (site profiles)

Chorus is not for browsing in general. It is optimized for a targeted set of
streaming (and reading) sites, one profile at a time:

- **Tier 1 (built-in):** YouTube, YouTube Music, Spotify.
- **Tier 2 (on demand):** any streaming site users raise an issue for
  (§7) — sports streams, regional VOD, live platforms, junk-free reading.
- A **site profile** is the unit of optimization: responsive/mobile layout
  fixes, player-first viewport, chrome adjustments, shield rules, and
  performance tuning (preload, media heuristics) for that host.
- UI optimization is explicitly in scope: if a streaming site renders badly
  on a phone, fixing that inside Chorus is product work, not a hack.

### 3.4 Safe, isolated browsing for long-tail sites

Streaming demand extends beyond tier-1 sites, often to low-quality ones.
Chorus supports that demand without poisoning the main experience:

- **Isolation:** per-site, isolated browsing contexts (ephemeral session,
  no shared cookies/storage with tier-1 logins, no persisted history unless
  the user opts in).
- **Safe browsing:** known-bad hosts warned or blocked; downloads and
  popups suppressed by default; trackers blocked by the shield everywhere.
- The bar for opening a site in Chorus is lower than the bar for a site
  profile: isolation is the safety net, optimization is the upgrade.

### 3.5 Native acceleration layer (secondary)

The React-native UIs for YouTube, YouTube Music (InnerTube), and Spotify
(Web API + PKCE previews) remain in the codebase as an **optimization
layer** — faster browse/search without rendering a full web page. They are
no longer the product's identity and must never be presented as content
sources in their own right: they are accelerators for the same services the
browser already renders. New feature work defaults to the browser path;
native-path work needs an explicit performance or UX rationale.

### 3.6 Reading & AI-native (future)

- **Reading mode:** reader-extraction for long-form pages — decluttered,
  shield-clean text on our own typography. Second-class today, promoted
  once streaming pillars are stable.
- **AI-native (future):** on-device or opt-in AI that works on what the
  user is already viewing: summarize a video or article, answer questions
  about a stream, suggest the next thing. No AI feature may fetch content
  from anywhere other than the page the user opened — the same
  origin-serves-the-content rule as the browser itself.

## 4. Users and use cases

- **The cord-cut streamer (primary):** wants YouTube/YT Music/Spotify on an
  Android phone or tablet, logged into their own accounts, with no ads, no
  clutter, and a UI that respects the screen.
- **The long-tail watcher:** follows streaming sites that have no app and
  hostile mobile web experiences; wants them usable and safe.
- **The reader:** wants articles without popups, interstitials, and
  autoplaying video ads.

## 5. Platform targets

- **Android (primary):** phones and tablets; every UI change is verified on
  Android first via Maestro.
- **macOS (secondary):** desktop windows, strongest shield layer today
  (network-level).
- **Windows/Linux:** unvalidated; no support claims until someone runs it.

## 6. Legal & content positioning

This section is the product's legal foundation. It is engineering guidance,
not legal advice; counsel should review before any distribution beyond
personal use.

**The model.** Chorus is a browser. When a user opens youtube.com in Chorus,
Chorus's webview requests the page from YouTube's servers and renders the
response, exactly as Safari or Chrome would. The content — video, audio,
artwork, metadata — is selected, licensed, delivered, and paid for (by ads
or subscription) entirely between the user and the origin service. Chorus:

1. **Does not host, cache, store, re-serve, or redistribute any content.**
   Streams flow origin → user. There is no Chorus copy of anything.
2. **Does not download, rip, or record media.** No offline copies, no
   stream extraction, no saving of audio or video.
3. **Does not circumvent DRM or paywalls.** Protected streams (Spotify full
   tracks, any Widevine/FairPlay content) play — or don't — only in the
   service's own player under its own DRM. Blocked content stays blocked.
4. **Does not bypass authentication.** Sign-in happens on the service's own
   pages with the user's own credentials, which Chorus never sees or stores.
5. **Uses documented or openly-served endpoints**, and respects rate
   limits. No scraping of undocumented interfaces for content distribution.
6. **Filters client-side, on the user's device, for the user's own
   benefit.** Ad, tracker, and sponsor filtering operates only on what the
   user's own browser has already chosen to fetch — the identical
   mechanism, and legal category, as Safari content blockers, AdGuard, and
   uBlock Origin. Courts in major jurisdictions (e.g., Germany's Federal
   Court of Justice) have upheld end-users' right to block advertising;
   the publisher's page still reaches the user, and the user remains a
   customer the service can reach by other means.

**Design rules that keep the model true** (enforced in review):

- No feature may copy, persist, or re-transmit media outside the webview
  session.
- No feature may strip DRM, fake entitlements, or spoof another client to
  unlock content the user has not paid for. (Desktop UA in the webview is
  compatibility engineering so the official site works in the embedded
  engine — not an entitlement bypass.)
- The native acceleration layer must obey the same rules; its roadmap is
  capped accordingly (§3.5).
- Honest limits stay documented in the README (no patched-build or mod
  code, Spotify free-tier reality, ToS caveat, per-platform shield gaps).

**Residual risks, stated plainly:** client-side ad filtering may conflict
with individual services' terms of service even where it is lawful; the
native InnerTube path touches internal APIs and is the least conservative
part of the product; distribution through app stores may trigger review
under store policies regardless of law. The mitigation is the same for all
three: keep the browser path primary, keep filtering client-side, keep
every claim in the docs matchable to the code.

## 7. Site optimization requests (demand-driven scope)

Users raise an issue for a streaming site; that issue is the unit of product
planning. A good request includes: host URL, what breaks (layout, player,
ads leaking, performance), device, and screenshots. Triage:

1. **Shield gap** (ads getting through) — rules fix in `modules/blocker/`;
   highest priority; usually same-week.
2. **Rendering/responsive break** on mobile — site profile work (§3.3).
3. **Performance** (slow start, janky player) — profile tuning: preload,
   viewport, media heuristics.
4. **Safety** (scammy host) — isolate or warn, per §3.4.

Issues are labeled `shield` / `site-profile` / `perf` / `safety` so the
backlog reads as a filter-rule queue, a UI queue, and a tuning queue.

## 8. Non-goals

- **General-purpose browsing.** If a site is neither streaming nor reading,
  Chorus is not trying to win it.
- **Content hosting, redistribution, downloading, ripping, recording.**
- **DRM or paywall circumvention**, fake entitlements, account sharing
  tooling.
- **Official API keys / partner integrations** that would recreate quota and
  policy dependence on the services.
- **A sync/account service.** The user's accounts live with the services;
  Chorus ships no account or sync backend at all.
- **Chromium fork.** The system webview + our chrome + our shield is the
  product; owning a rendering engine is not.

## 9. Success metrics

- **Shield:** zero ad requests served per session on tier-1 sites (dev-build
  block counters); regression count per shield change = 0.
- **Site profiles:** time-to-first-frame on tier-1 players ≤ stock Chrome on
  the same device; no horizontal scroll, no unreachable controls on
  360–800 dp widths.
- **Reliability:** every shield change backed by a Maestro flow on Android;
  history/tabs/shortcuts survive restart.
- **Demand signal:** issues triaged into §7 queues within a week; profile
  shipped for every `site-profile` issue accepted into a milestone.

## 10. Roadmap

The actionable plan lives in [`ROADMAP.md`](../ROADMAP.md); this section is
the authoritative phase structure and feature inventory.

### 10.1 Feature inventory

Status legend: **Shipped** (in the code today) · **Next** (current focus) ·
**Planned** (committed roadmap) · **Exploring** (future scope, not
committed) · **Open** (required, not started).

| Feature                                                           | Status                     | Lives in                        |
| ----------------------------------------------------------------- | -------------------------- | ------------------------------- |
| Chorus Browser shell: persistent webview, floating chrome         | Shipped                    | `modules/browser/`              |
| Mobile in-place navigation with injected **← Chorus** chrome      | Shipped                    | `modules/browser/`              |
| Desktop service windows (torn down on service switch)             | Shipped (macOS)            | `modules/browser/`              |
| Desktop UA so official sign-in works in the embedded engine       | Shipped                    | `modules/services/`             |
| Browser home: shortcuts + service-grouped history (SQLite)        | Shipped                    | `crates/browser-store/`         |
| Favicon discovery for shortcuts                                   | Shipped                    | `modules/browser/`              |
| Shield: injected page filter (`fetch`/`XHR` patch + cosmetic CSS) | Shipped (all platforms)    | `crates/blocker/`               |
| Shield: network-level request filtering                           | Shipped on macOS           | `modules/blocker/`              |
| SponsorBlock auto-skip with toast (YouTube, YouTube Music)        | Shipped                    | `modules/blocker/`              |
| Native YouTube browse/search/watch (InnerTube)                    | Shipped (acceleration)     | `modules/providers/`            |
| Native YouTube Music browse/search/play                           | Shipped (acceleration)     | `modules/providers/`            |
| Native Spotify browse/search + 30-second previews (Web API, PKCE) | Shipped (acceleration)     | `modules/providers/`            |
| Themes: light, dark, system across the shadcn/ui palettes         | Shipped                    | `features/settings/`            |
| Declarative Maestro E2E suite on Android                          | Shipped                    | `maestro/`                      |
| Android network-level shield (parity with macOS)                  | Next — top priority        | `modules/blocker/`              |
| Production Content Security Policy                                | Open — release gate        | shell config                    |
| Store signing and release pipeline                                | Open — release gate        | bundle config                   |
| Importable filter rule sets (EasyList/EasyPrivacy-style)          | Planned — Phase 1          | `crates/blocker/`               |
| Per-site shield overrides                                         | Planned — Phase 1          | `crates/blocker/`               |
| Block counters surfaced in the shield UI                          | Planned — Phase 1          | `modules/browser/`              |
| Site-profile framework (per-host shield/chrome/responsive tuning) | Planned — Phase 2          | `modules/services/` + profiles  |
| Isolated ephemeral contexts for long-tail sites                   | Planned — Phase 2          | `modules/browser/`              |
| Safe-browsing warnings; popup/download suppression                | Planned — Phase 2          | `modules/browser/`              |
| Reading mode (reader extraction, same shield guarantees)          | Planned — Phase 3          | new `modules/reader/`           |
| AI-native assistance (view-scoped, opt-in, origin-bound)          | Exploring — Phase 4        | —                               |
| SponsorBlock category toggles in settings                         | Planned — continuous       | `features/settings/`            |
| Spotify full-track playback via the Web Playback SDK (DRM intact) | Planned — continuous       | `modules/providers/`            |
| More tier-1 sites by demand                                       | Planned — continuous       | `modules/providers/` + profiles |
| Windows/Linux validation                                          | Open — no claims until run | —                               |

### 10.2 Phases

- **Phase 0 — now.** Browser home with shortcuts/history/tabs; injected
  chrome; tier-1 sites; three shield layers; macOS network-level blocking.
- **Phase 1 — Shield to AdGuard-grade.** Android network-level filtering;
  EasyList/EasyPrivacy-style importable rule sets; per-site rule
  overrides; block counters surfaced in the shield UI.
- **Phase 2 — Profiles & isolation.** Site-profile framework (per-host
  shield rules, chrome variants, responsive fixes); isolated ephemeral
  contexts for long-tail sites; safe-browsing warnings.
- **Phase 3 — Reading.** Reader mode with the same shield guarantees.
- **Phase 4 — AI-native.** View-scoped AI assistance (§3.6), opt-in,
  origin-bound.
- **Continuous.** SponsorBlock category toggles, Spotify Web Playback SDK
  (full tracks in the native layer, DRM intact), more tier-1 sites by
  demand.

## 11. Open questions

- Android network-level filtering: `shouldInterceptRequest` in the Tauri
  Wry/WebView stack vs. a local-proxy approach — decision needed before
  Phase 1 implementation starts.
- Isolation mechanics (§3.4): separate webview instances vs. partitioned
  data stores in one instance — depends on Wry's per-webview data store
  support on Android.
- Rule-list format: adopt AdGuard/EasyList syntax directly (compat) or
  compile to our `WKContentRuleList`/JS rule IR (control) — likely compile,
  with compat import.
