# AGENTS.md — Chorus

**Every stream. One chorus. Zero ads.** A Tauri 2 streaming browser
(Android-first, macOS secondary) with a React 19 + TypeScript frontend and a
Rust backend. Chorus renders the official streaming websites in an embedded,
persistent webview under its own chrome and filters ad, tracker, and sponsor
traffic client-side.

This file is the binding rulebook for this repository. Read it before changing
code. Product requirements live in [`docs/prd.md`](./docs/prd.md).

<critical_rules>

## Transparency by default

Everything you add — code, comments, commit messages, branch names, issues, PR
text, test fixtures, screenshots — is visible to everyone.

- **Never commit secrets.** No `.env` files, tokens, cookies, client secrets,
  keystores, signing certificates, or personal data.
- **Keep the build standalone.** The app must build, test, and run from this
  repository alone, with no external service beyond the streaming sites
  themselves.

## Commit gate

**Agents and automated assistants must not commit, push, tag, or open a PR
without explicit confirmation from the maintainer in the current session.**
Show the branch, the exact files, the proposed commit message, and the commands
you ran, then wait for a clear yes. Approval is per commit, not standing.

Human contributors follow the normal fork → branch → pull-request flow.

## Dependencies

Never add, remove, or upgrade a dependency without explicit maintainer
approval. State the name, version, and reason, then wait. This covers Bun
packages and Cargo crates.

## Brand hygiene in git metadata

Commit messages, branch names, tags, and PR titles/descriptions never name a
third-party brand. The services Chorus supports — YouTube, YouTube Music, and
Spotify — are the allowlist. Before committing, scan the drafted message; on a
hit, pause and rewrite with a generic term.

</critical_rules>

## Project intent

Chorus is a **streaming browser**, not a general-purpose browser and not a media
service. It renders the official websites in an embedded, persistent webview
with always-on client-side filtering. The user signs in with their own accounts
on the service's own pages; Chorus hosts, stores, downloads, and redistributes
nothing. Content flows origin → user, exactly as in any browser.

This model is the product's legal foundation. Never add a feature that breaks
it:

- no stream ripping, recording, or extraction;
- no DRM or paywall circumvention;
- no authentication bypass, fake entitlements, or credential scraping;
- no hosting, proxying, or re-serving of content.

Scope is **streaming first, reading second**. Per-site optimization — shield
rules, responsive fixes, player tuning — is the unit of product work. General
browsing is a non-goal.

**Android is the primary target.** macOS is secondary. Windows and Linux are
not validated. Do not describe a platform or provider feature as implemented
unless the code does; do not claim a platform was verified just because it
compiled.

## Repository layout

```text
apps/chorus/                 Tauri application
  src/                       React 19 + TypeScript client
    components/ui/           vendored shadcn/ui primitives
    features/                browser-home, youtube, music, spotify, settings
    lib/api.ts               the only place that calls Tauri invoke()
    lib/types.ts             TypeScript mirrors of the Rust wire models
  src-tauri/                 Rust backend
    src/lib.rs               composition root: plugins, window, commands
    src/modules/browser/     Chorus Browser commands and chrome
    src/modules/providers/   YouTube, YouTube Music, Spotify, InnerTube
    src/modules/blocker/     shield rules, injected scripts, macOS rules
    src/modules/services/    service registry and desktop user agent
    src/shared/              primitives shared by 2+ modules
    crates/                  standalone library crates (browser-store, blocker)
  maestro/                   declarative Android E2E flows
apps/                        workspace for future applications (server, marketing)
packages/                    shared packages (reserved)
docs/                        product and protocol documentation
```

Dependencies point downward only:
`lib.rs` → `modules` → `shared` → `crates`. No cycles, no sideways imports
between sibling modules. `shared/` must never import from `modules/`. In-repo
crates must never depend on the Tauri app.

**Placement ladder.** A single caller's helper stays private in its module; a
primitive 2+ modules need goes in `shared/`; a bounded capability becomes a
module; reusable or dependency-heavy logic becomes a crate. Move code up a
tier only when the trigger fires, in the same change. Name modules for the
capability — never create `utils.rs`, `helpers.rs`, or `common.rs` dumping
grounds.

The app lives in **`apps/chorus/`**. Run every app command from that directory.

## Commands (run from `apps/chorus/`)

| Task                           | Command                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| Install dependencies           | `bun install`                                                 |
| **Android dev (primary loop)** | `bun android`                                                 |
| Frontend dev server only       | `bun dev`                                                     |
| Type-check + production build  | `bun run build`                                               |
| Format supported files         | `bun run format`                                              |
| Check formatting               | `bun run format:check`                                        |
| Rust tests (offline)           | `cargo test` (in `src-tauri/`)                                |
| Rust live protocol tests       | `cargo test --test live_api` (in `src-tauri/`)                |
| Rust lint                      | `cargo clippy --all-targets -- -D warnings` (in `src-tauri/`) |
| Desktop dev                    | `bun run tauri dev`                                           |
| Android debug APK              | `bun run tauri android build --target aarch64 --debug --apk`  |

Package manager is **Bun** (one root `bun.lock` for the whole workspace).
Never introduce `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`. The Vite
dev server is pinned to port 1420 with `strictPort: true`; a stale server blocks
`bun android`.

## Testing

Two rules are binding on every change:

- **Prefer TDD.** Start from the smallest focused test that states the desired
  behaviour or reproduces the defect. Confirm it fails for the intended reason,
  make the smallest production change, then refactor while it stays green.
- **A UI change requires a passing Maestro run.** A change to layout, copy,
  state rendering, navigation, interaction, or data display ships with a
  targeted Maestro flow that asserts the rendered result. Run the flow; do not
  describe a run you did not execute.

Every flow lives in `apps/chorus/maestro/`, one feature per file. Run the flows tied to
the change; a full run is for cross-cutting changes. All screenshots from local
runs go in `.temp/screenshorts/` and are never committed.

Before a PR, run:

```bash
cd apps/chorus
bun run build
bun run format:check

cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```

For provider changes, also run `cargo test --test live_api`. For UI changes,
add and run the targeted Maestro flow on an Android device or emulator.

### Maestro MCP setup

Prerequisites, in order:

1. `adb devices` — an Android device/emulator must be attached and visible.
2. `bun android` — the dev app must be running (Vite on port 1420 + the
   Tauri watcher).
3. Maestro MCP `list_devices` — pick the `device_id` it returns. Never invent
   a device ID.

Workflow per feature: `inspect_screen` before targeting any element; author
the flow as declarative YAML (launchApp → actions → assertions); `run` with
`{ device_id, yaml }`; re-inspect after any UI change — element trees go
stale after navigation or hot reload; fix what the flow catches and re-run
until green. One full flow beats many single-command calls.

## Naming conventions

What no tool enforces is repeated here.

### Rust

| Kind                                     | Convention                         | Chorus example                             |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------ |
| Files / modules                          | `snake_case`                       | `innertube.rs`, `macos_blocker.rs`         |
| Types / traits / enums                   | `PascalCase`                       | `MediaItem`, `WatchData`, `Kind`           |
| Functions / methods / variables / fields | `snake_case`                       | `youtube_search`, `video_id`               |
| Consts / statics                         | `SCREAMING_SNAKE_CASE`             | `DESKTOP_UA`, `SERVICES`                   |
| Tauri command names                      | `snake_case`, stable               | `youtube_search`, `spotify_save_client_id` |
| Crate                                    | package `chorus`, lib `chorus_lib` | do not rename                              |

Commands are a cross-language contract. Renaming one is a breaking change to
both Rust and TypeScript.

### TypeScript & React

**Files are kebab-case, with a role suffix carrying one role per file.**

| Kind                       | File name                         | Example                                       |
| -------------------------- | --------------------------------- | --------------------------------------------- |
| React component            | `<name>.tsx`                      | `MediaCard` in `components/media-card.tsx`    |
| React hook                 | `useHookName.ts`                  | `useAudioPlayer` in `hooks/useAudioPlayer.ts` |
| shadcn / Radix primitive   | `<name>.tsx`                      | `components/ui/button.tsx`                    |
| Typed IPC wrapper / module | `<name>.ts`                       | `lib/api.ts`                                  |
| Shared types               | `<domain>.types.ts`               | `MediaItem` in `lib/media.types.ts`           |
| Pure helpers               | `<name>.utils.ts`                 | `formatDuration.utils.ts`                     |
| Constants / query keys     | `<name>.constants.ts`             | `query-keys.constants.ts`                     |
| Feature page / component   | `<name>.tsx` or `<name>-page.tsx` | `launcher.tsx`, `music-page.tsx`              |
| Maestro flow               | `<feature>.yaml`                  | `maestro/youtube-search.yaml`                 |
| Vite / toolchain config    | framework name                    | `vite.config.ts`                              |

- React components are kebab-case files with a PascalCase symbol matching the
  export — this is what shadcn generates; stay consistent with the CLI.
- Hooks: exactly one hook per file, named verbatim after the hook. Never
  `use-audio-player.ts`, never `useAudioPlayer.hook.ts`, and never
  types/helpers riding along in the same file.
- Framework-fixed names are exempt: `main.tsx`, `App.tsx`, `vite-env.d.ts`,
  `vite.config.ts`, `tsconfig*.json`. Folders stay kebab-case.
- Symbols: components `PascalCase`; hooks `use` + `PascalCase`; interfaces
  and type aliases `PascalCase` with **no `I`/`T` prefix** (`MediaItem`,
  `SpotifyStatus`) — `interface` for objects, `type` for unions; variables,
  functions, parameters `camelCase`; compile-time constants only in
  `SCREAMING_SNAKE_CASE`; typed errors `PascalCase` ending `Error`.

### Cross-boundary consistency

The IPC boundary is the one place where Rust and TypeScript names must agree:
the command name, its argument keys (camelCase in TS ↔ serde in Rust), and
its return type. When you rename on one side, rename the other in the **same
change** — a silent mismatch shows up only as `undefined` at runtime.

## Rust rules

- Edition 2024. Do not add a toolchain pin or clippy/rustfmt config.
- Every `#[tauri::command]` is untrusted input crossing a process boundary:
  validate with serde, delegate to the owning module, map the error.
- Commands live in the module that owns the capability and are registered
  exactly once in `src/lib.rs` → `invoke_handler`.
- Return typed structs, never ad-hoc tuples or maps the UI must interpret.
- No `unwrap()`, `expect()`, or panic-prone indexing outside tests and startup.
  Use `?`, `match`, or `.unwrap_or*`/`.ok_or*`.
- No `unsafe` without a documented, unavoidable reason and a `// SAFETY:` note.
- Never hold a lock guard across `.await`. Scope the guard, copy out, then
  await.
- Blocking I/O or CPU-heavy work goes to `spawn_blocking`.
- Long-running tasks need an explicit shutdown path and exactly one start site.
- Exported items get rustdoc `///`; every module gets a `//!` doc comment stating
  what it owns. No inline narration comments.
- Never log secrets, tokens, or full provider response payloads.
- Tauri supplies the async runtime. Do not add a tokio runtime; the existing
  `tokio` dependency is limited to `sync`/`macros` primitives.
- The release profile (`lto`, `strip`, `panic = "abort"`,
  `codegen-units = 1`) is deliberate. Never weaken it to speed up a local
  build, and never rely on `catch_unwind` in release.

## TypeScript and React rules

- TypeScript stays strict: `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `isolatedModules`. Never relax a flag or use
  `any`/`@ts-ignore`/`@ts-expect-error` to silence a type you have not
  understood.
- Imports flow inward only: `features/components` → `hooks` → `lib`. Never the
  reverse; no feature imports another feature's internals.
- `apps/chorus/src/lib/api.ts` is the only place allowed to call `invoke()`. Components
  never call it directly.
- Treat IPC payloads as untrusted. `api.ts` is the boundary; components consume
  domain types.
- TanStack React Query is the data layer; Effect is not installed. Do not add
  a second data or state layer without approval. Keep query keys stable
  arrays. A component that fetches data owns the query and renders loading,
  error, empty, and data states. Do not mirror fetched data into `useState`
  plus `useEffect`.
- `useState` is for ephemeral UI state only. Derive everything else during
  render.
- Never use `dangerouslySetInnerHTML`. Provider data is never markup.
- No direct HTTP requests in the renderer. Network access belongs to Rust.
- Timestamps cross the boundary as epoch milliseconds (`number`), formatted
  only at render.
- Named exports by default; only entry points use a default export.
- Use JSDoc `/** … */` for real contracts. No inline `//` narration.

## UI rules

- **shadcn-first, strictly.** If a component exists in the shadcn registry, use
  it: install with `bunx shadcn@latest add <name>` from `apps/chorus/`. Never hand-roll
  an equivalent. Custom components are the exception, built on the vendored
  primitives and theme tokens, with the reason stated.
- Use theme tokens from `apps/chorus/src/index.css` only. No raw palette colours.
- Use the 4px spacing grid and the `--radius` scale: `rounded-lg` panels,
  `rounded-md` controls, `rounded-xl` floating overlays.
- `apps/chorus/src/components/ui/` is generated shadcn code. Do not hand-edit it to work
  around app code.
- Keep provider-specific behavior in `src/features/<domain>/` and
  `src-tauri/src/modules/providers/`. Generic UI must not branch on provider
  quirks.

## Architecture

```
Chorus Browser (modules/browser/ + browser-home)  ── persistent webview ──▶ official sites
      │ always-on Shield (modules/blocker/) on every page
      │
React (apps/chorus/src/)  ──invoke()──▶  Rust Tauri commands (apps/chorus/src-tauri/src/modules/)
     │                            ├─ providers/innertube.rs → InnerTube API
src/lib/api.ts                    ├─ providers/youtube.rs   → browse/search/watch
(the ONLY data layer)             ├─ providers/music.rs     → home/search/play
                                  └─ providers/spotify.rs   → Web API (PKCE)
```

- **Chorus Browser (primary)** — `open_browser(id)` opens the official web
  app inside a persistent webview with our own chrome and always-on Shield
  filtering. Chorus is **single-site**: one website is active at a time —
  mobile navigates the single main window in place (with the injected
  **← Chorus** chrome); desktop keeps at most one service window and tears
  the previous one down when the user switches services. No tabs, no
  parallel sessions. The desktop UA keeps official sign-in working. Browser
  home (shortcuts/history, SQLite via the `browser-store` crate) is the
  launcher.
- **Native acceleration layer (secondary)** — `src/lib/api.ts` is the single
  typed data layer over the Rust commands; wire models share the same
  camelCase JSON across the boundary. It accelerates browse/search for the
  same services the browser renders; it is not a separate content source,
  and new feature work defaults to the browser path.

### Backend surfaces

- `modules/providers/<service>.rs` — one module per service; public async
  fns are the Tauri commands. **When adding a command:** register it in
  `lib.rs` → `invoke_handler`, then add a typed wrapper in `src/lib/api.ts`.
- Commands return `Result<T, String>` — errors surface to the frontend as
  strings; `api.ts` wraps them into `Error` for React Query. Return
  descriptive error strings (endpoint + cause).
- `modules/blocker/` — ad/tracker network rules + injected page scripts (all
  platforms), plus macOS-only network-level blocking. If a service changes
  its ad endpoints, update this module.
- `modules/services/` — service registry + desktop UA. `modules/browser/` —
  Chorus Browser; on mobile the main window navigates in place, with an
  injected back button.
- `shared/domain/` — wire models shared by providers and the frontend.

### Adding a feature end-to-end (checklist)

1. Rust command in the owning module under `src-tauri/src/modules/`, plus a
   `shared/domain/` struct if the shape is shared (camelCase serde).
2. Register in `lib.rs` `invoke_handler`; add a wrapper to `src/lib/api.ts`;
   mirror the type in `src/lib/types.ts`.
3. Page/component under `src/features/<domain>/`, route in `App.tsx`, data
   via React Query.
4. `bun run build` clean → `bun run format:check` + `cargo clippy
   --all-targets -- -D warnings` clean → verify on Android via `bun android`
   → add + run a Maestro flow in `apps/chorus/maestro/`.

## Security and privacy

- Never commit API keys, session tokens, cookies, client secrets, personal
  account data, or `.env` files.
- Spotify tokens are stored by Rust in the app data directory. They must never
  cross into frontend state, component props, or source.
- Keep ad/tracker rules and SponsorBlock behavior in `modules/blocker/`. Do not
  weaken or bypass them in UI code.
- Every new Tauri capability is approval-gated: state the capability, its risk,
  and why a narrower set will not do.
- `app.security.csp` is `null` today and is development-only. Any change that
  ships release behavior must set a real CSP first.
- Provider failures must degrade to an honest error or unavailable state; never
  present made-up data as real.

## Git and pull requests

- Conventional commits: `type(scope): subject` (`feat`, `fix`, `docs`,
  `refactor`, `test`, `chore`, …), imperative mood, body explains why. No
  generated attribution footers.
- Branch from `main`; keep one focused concern per branch and PR.
- PRs target `main` in this repository. Describe what changed, why, and which
  commands/tests/Maestro flows ran.
- Do not force-push `main`, rewrite shared history, or merge without review.
- Do not commit generated output: `node_modules/`, `target/`, `dist/`, `gen/`,
  `.temp/`, or local secrets.
- Keep the root `bun.lock` and `apps/chorus/src-tauri/Cargo.lock` with
  dependency changes; never hand-edit either.

## Gotchas

- `target/`, `gen/`, `dist/`, `node_modules/`, and `.temp/` are
  generated/scratch — never edit or commit them.
- Don't rename the crate (`chorus_lib` in `Cargo.toml`) or the Vite port
  (1420); both are wired into the Tauri build.
- On mobile there is only **one window** — multi-window code paths are
  `#[cfg(desktop)]`; respect those guards.
- The release profile uses `lto`, `strip`, `panic = "abort"` — debug builds
  only for dev; `cargo test` runs in the dev profile.
- Linux distribution compatibility is unvalidated — never infer support from
  one build.

## Definition of done

- [ ] The change is in the correct files and follows the module boundaries.
- [ ] Tests cover the behaviour, including the error branch where one exists.
- [ ] `bun run build`, `bun run format:check`, `cargo clippy`, and `cargo test`
      pass.
- [ ] A targeted Maestro flow passed for every UI change.
- [ ] No secret or personal data is present.
- [ ] The commit message is conventional and brand-safe.
- [ ] The maintainer confirmed any commit, push, tag, or PR.
