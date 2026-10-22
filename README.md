# Chorus

**Every stream. One chorus. Zero ads.**

Chorus is a **streaming browser**, not a general-purpose browser and not a media
service. It renders the official streaming websites — YouTube, YouTube Music,
Spotify today, more on request — inside an embedded, persistent webview, wraps
them in Chorus's own mobile-first chrome, and filters ad, tracker, and sponsor
traffic **client-side**.

You sign in with your real accounts, on the real site, over the service's own
endpoints. Chorus hosts nothing and redistributes nothing: every stream flows
from the origin service to you. All that changes is what gets filtered before it
reaches your screen.

![Chorus](app/public/chorus.svg)

> **Status:** active development. **Android is the primary target**; macOS is
> secondary. Windows and Linux builds are not validated. This repository is the
> source of truth for the app and its documentation.

## Why a browser?

A browser is the only client that can show a streaming service exactly as the
service built it: its player, its recommendations, its account system, its DRM.
Chorus keeps that surface intact and adds the one thing the service will not:
always-on, client-side ad and tracker filtering.

That gives three properties:

1. **The official site is the app.** Your logins, playlists, subscriptions, and
   playback quality are the service's own. Chorus does not proxy, mirror, or
   re-host them.
2. **Zero ads is a product requirement.** The Chorus Shield filters at three
   layers (below). When a service changes an ad endpoint, the fix is a rule
   update — never a browser or account workaround.
3. **Optimization is per site.** A streaming site that renders badly on a phone,
   leaks an ad, or plays badly is fixed with a _site profile_: shield rules,
   responsive/layout fixes, and player tuning for that host.

Scope is **streaming first, reading second**. General browsing is a non-goal;
long-tail streaming sites are supported through safe, isolated browsing
contexts. AI-native assistance is future scope.

## The Chorus Shield

The shield is the product's core. It is always on, on every page, and never
implemented as a UI workaround.

| Layer                    | Platforms               | What it does                                                                                                                                         |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network filtering**    | macOS                   | A `WKContentRuleList` cancels ad/tracker requests before they leave the machine: ad networks, ad-format video segments, midroll endpoints, and more. |
| **Injected page filter** | all platforms           | Patches `fetch`/`XMLHttpRequest` and injects cosmetic CSS that removes ad slots, upsell banners, and surveys as the page renders.                    |
| **SponsorBlock**         | YouTube / YouTube Music | Auto-skips sponsor reads, self-promos, interaction reminders, intros/outros, and recaps using the community API, with a small toast.                 |

Android currently relies on the injected page filter. **Network-level filtering
on Android is the top shield roadmap item** and the step that brings the primary
platform to parity with macOS.

Rules live in `app/src-tauri/src/modules/blocker/` and the reusable filter
engine in `app/src-tauri/crates/blocker/`. Filter lists are living data: when a
service changes its ad endpoints, update the rules there.

## What is in the app

- **Browser home** — curated streaming shortcuts and service-grouped history,
  backed by SQLite through the `browser-store` crate.
- **Chorus Browser** — the official web apps in a persistent webview with our
  own floating chrome (home, reload, back, forward). Single-site by design: one
  website is active at a time, with no tabs or parallel sessions.
- **Desktop user agent** — keeps official sign-in working inside the embedded
  engine on every platform.
- **Native acceleration layer** — React pages over Rust providers for faster
  browse/search: YouTube and YouTube Music through InnerTube (no official API
  keys), Spotify through the Web API with PKCE and 30-second previews. This
  layer accelerates the same services the browser renders; it is not a separate
  content source.
- **Settings and themes** — light, dark, and system mode across the bundled
  shadcn/ui palettes.

## How it works

```
┌──────────────────────────── Chorus (Tauri 2) ────────────────────────────┐
│                                                                          │
│  Chorus Browser — the product                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Official web apps with our chrome, desktop UA, persistent        │    │
│  │ sessions, and the always-on Shield                               │    │
│  │   youtube.com · music.youtube.com · open.spotify.com             │    │
│  │   + any streaming site (safe, isolated contexts)                 │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Native acceleration layer (secondary)                                   │
│  ┌────────────────────┐          ┌───────────────────────────────────┐   │
│  │ React UI (src/)    │ invoke() │ innertube.rs → InnerTube API      │   │
│  │ launcher / youtube │ ───────▶ │ youtube.rs   → home/search/watch  │   │
│  │ music / spotify    │          │ music.rs     → home/search/play   │   │
│  │                    │          │ spotify.rs   → Web API (PKCE)     │   │
│  └────────────────────┘          └───────────────────────────────────┘   │
│                                                                          │
│  Browser home: shortcuts · service-grouped history (Rust/SQLite)         │
└──────────────────────────────────────────────────────────────────────────┘
```

On Android the single main window navigates in place, so the experience is
app-like rather than tab-like. On macOS, the browser can open a service window;
switching services tears the previous one down.

### Code map

| Path                                   | What it is                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| `app/src/`                             | React 19 + TypeScript UI; feature folders under `features/`       |
| `app/src/lib/api.ts`                   | The only place that calls Tauri `invoke()`                        |
| `app/src-tauri/src/lib.rs`             | Composition root: plugins, main window, command registration      |
| `app/src-tauri/src/modules/browser/`   | Chorus Browser commands, chrome injection, favicon discovery      |
| `app/src-tauri/src/modules/providers/` | One Rust module per service plus the InnerTube client             |
| `app/src-tauri/src/modules/blocker/`   | Shield adapter and macOS `WKContentRuleList` installer            |
| `app/src-tauri/src/modules/services/`  | Service registry and desktop user agent                           |
| `app/src-tauri/crates/browser-store/`  | SQLite persistence for shortcuts and history                      |
| `app/src-tauri/crates/blocker/`        | Filter rules, injected scripts, and the reusable blocking engine  |
| `app/maestro/`                         | Declarative Android E2E flows, one per feature                    |
| `docs/prd.md`                          | Product requirements: vision, pillars, legal positioning, roadmap |
| `docs/android-shell.md`                | Android window-inset and layout authority                         |

## Quick start

Prerequisites: [Bun](https://bun.sh) 1.4.3, a stable Rust toolchain, and the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
platform. Android also needs the Android SDK, NDK, and JDK 17.

```bash
cd app
bun install
bun android         # Android dev — the primary target
bun run tauri dev   # desktop (macOS)
bun run tauri build # desktop release bundle
```

The Vite dev server is pinned to port **1420** with `strictPort: true`. A stale
server blocks `bun android`; stop it with `lsof -ti:1420 | xargs kill`.

## Android

```bash
cd app
rustup target add aarch64-linux-android
cargo install cargo-ndk
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/<version>

bun run tauri android init        # first time only; generated gen/ is gitignored
bun android                       # dev on a device/emulator
bun run tauri android build --target aarch64 --debug --apk
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

On mobile, everything runs in the single main window. Sites opened in the
browser navigate it in place, with injected chrome to come back home.

## Tests

Rust (from `app/src-tauri/`):

```bash
cargo test                 # unit tests (offline)
cargo test --test live_api # live protocol validation against real service endpoints
```

E2E with Maestro (Android device/emulator, with `bun android` running):

```bash
cd app
maestro test maestro/browser-home.yaml             # browser home renders
maestro test maestro/browser-youtube-ncs.yaml      # YouTube opens in-browser, ad-free
maestro test maestro/browser-spotify-no-login.yaml # Spotify opens in-browser
```

One declarative Maestro flow per feature lives in `app/maestro/`. Screenshots
from local runs belong in `.temp/screenshorts/` and are never committed.

## Quality gates

```bash
cd app
bun run build
bun run format:check

cd app/src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```

`bun run build` includes the strict TypeScript checks. A green Vite build alone
is not enough.

## Legal and content positioning

Chorus is a browser in the oldest, most settled sense: it fetches and renders,
at the user's direction, pages from origin servers. The content is selected,
licensed, delivered, and paid for entirely between the user and the service.
Chorus is not a party to that exchange and takes no part of it.

The code obeys these rules:

- **No hosting, caching for redistribution, or re-serving of content.** Streams
  flow origin → user; there is no Chorus copy of anything.
- **No downloading, ripping, recording, or stream extraction.**
- **No DRM or paywall circumvention.** Protected streams play only in the
  service's own player under its own DRM.
- **No authentication bypass.** Sign-in happens on the service's own pages with
  your credentials, which Chorus never sees.
- **Client-side filtering only.** Ad/tracker/sponsor filtering acts on requests
  the user's own browser chose to make — the same mechanism and legal category
  as mainstream content blockers.

Chorus does not include or reuse code from patched builds or mods of the
services' apps. It is a browser plus client-side content filtering.

That section is engineering guidance, not legal advice. Individual services'
terms may still restrict filtering, and app-store review is its own process.

## Honest limits

- **Android shield:** network-level request blocking is not implemented yet;
  Android uses the injected page filter. This is the top roadmap item.
- **Platform validation:** macOS is secondary. Windows and Linux are not
  validated.
- **Spotify native playback:** full tracks require Spotify's DRM (Web Playback
  SDK on the roadmap), so the native layer plays 30-second previews. Use the
  browser for full-track playback with your account.
- **Spotify free tier:** the free web player serves audio ads server-side and
  may stall if ad audio is blocked. A Premium account gives the clean
  experience. Filtering may conflict with a service's terms of service — use
  your own account at your own discretion.
- **InnerTube:** the native YouTube layer talks to an internal endpoint that can
  change without notice. The browser path remains the conservative default.
- **Release hardening:** a production Content Security Policy, store signing,
  and the Android network-level shield are still open before a store release.

## Roadmap

The active plan lives in [`ROADMAP.md`](ROADMAP.md); phases and the full
feature inventory in [`docs/prd.md` §10](docs/prd.md#10-roadmap).

- [ ] **AdGuard-grade shield on Android** — network-level filtering, importable
      rule sets, per-site overrides, block counters in the shield UI
- [ ] **Site profiles and isolation** — per-host shield/chrome/responsive
      tuning; safe, isolated contexts for long-tail streaming sites
- [ ] **Reading mode** — decluttered reader extraction with the same shield
      guarantees
- [ ] **AI-native assistance** (view-scoped, opt-in, origin-bound)
- [ ] SponsorBlock category toggles in settings
- [ ] Spotify full-track playback via the Web Playback SDK (DRM intact)

## Contributing

This repository is the home of Chorus development.

- Read [`AGENTS.md`](AGENTS.md) before changing code; it is the binding rulebook
  for this repository.
- Open an issue before a large change so the approach can be agreed first. Site
  optimization requests are welcome — they drive the roadmap.
- Keep pull requests focused, include the tests you ran, and never commit
  secrets, credentials, `.env` files, or signing material.
- UI changes need a targeted Maestro flow in `app/maestro/` and a real Android
  run.
- Commit messages follow `type(scope): subject` and contain no third-party brand
  names; the services Chorus supports are the exception.
- Maintainers review and merge every PR. Automated assistants must not commit,
  push, tag, or open a PR without explicit maintainer confirmation.

## Security

Report vulnerabilities through GitHub's security advisory flow (Security →
Report a vulnerability) instead of opening an issue, and never include secrets
or personal data in a report.

## License

No open-source license has been declared yet. A `LICENSE` file will be added
before the first stable release. Until then, the source is published for
transparency and review; do not redistribute modified builds.
