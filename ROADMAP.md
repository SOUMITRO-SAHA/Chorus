# Chorus Roadmap

**Every stream. One chorus. Zero ads.**

The living plan for Chorus, ordered by priority. Phase structure, feature
inventory, and legal boundaries are authoritative in
[`docs/prd.md`](docs/prd.md) (§10 and §7). Engineering rules are binding in
[`AGENTS.md`](AGENTS.md).

Statuses: **Now** (active focus) · **Next** (committed, up next) ·
**Later** (committed, sequenced) · **Future** (exploring) · **Continuous**
(ongoing backlog). Nothing here is claimed as done unless the code does it.

---

## Now — active focus

### Android network-level shield

The top shield item: bring the primary platform to parity with macOS.

- Cancel ad/tracker requests before they hit the wire on Android
  (`WebViewClient.shouldInterceptRequest`-based, or a local-proxy approach —
  decision tracked in [PRD §11](docs/prd.md#11-open-questions)).
- Done when: zero ad requests served per session on tier-1 sites on Android,
  measured by dev-build block counters, with a Maestro flow guarding the
  behaviour.

### Release hardening (gate for the first stable release)

- [ ] Production Content Security Policy (`default-src 'self'` plus explicit
      allowances; no `unsafe-eval`) replacing the current development-only
      `null`.
- [ ] Store signing and a repeatable Android release build/pipeline.
- [ ] Windows/Linux: no claims until someone actually validates a build.

## Next — Phase 1: Shield to AdGuard-grade

- [ ] Importable filter rule sets (EasyList/EasyPrivacy-style syntax; likely
      compiled to our rule IR, with compat import — see
      [PRD §11](docs/prd.md#11-open-questions)).
- [ ] Per-site shield overrides (strengthen or relax rules for one host).
- [ ] Block counters surfaced in the shield UI.
- [ ] Shield regression discipline: every shield change lands with a
      measurable before/after.

## Later — Phase 2: Profiles & isolation

- [ ] Site-profile framework: per-host shield rules, chrome variants,
      responsive/layout fixes, player tuning (preload, media heuristics).
- [ ] Isolated ephemeral contexts for long-tail streaming sites: no shared
      cookies/storage with tier-1 logins; no persisted history unless
      opted in.
- [ ] Safe-browsing warnings for known-bad hosts; popups and downloads
      suppressed by default.

## Later — Phase 3: Reading

- [ ] Reading mode: reader extraction for long-form pages — decluttered,
      shield-clean text on our own typography. Promoted once the streaming
      pillars are stable.

## Future — Phase 4: AI-native (exploring)

- View-scoped AI assistance: summarize a video or article, answer questions
  about what is on screen, suggest the next thing.
- Opt-in, on-device or user-keyed, and origin-bound: no AI feature fetches
  content from anywhere other than the page the user opened.

## Continuous backlog

- [ ] SponsorBlock category toggles in settings (choose what auto-skips).
- [ ] Spotify full-track playback in the native layer via the Web Playback
      SDK — DRM intact; until then the native layer plays 30-second
      previews and full tracks belong to the browser.
- [ ] More tier-1 sites by demand (site requests drive this — see below).
- [ ] Shield rule updates whenever a service changes an ad endpoint: rules
      are data in `crates/blocker/` and `modules/blocker/`.

## How this roadmap moves

Site optimization requests are the unit of product planning
([PRD §7](docs/prd.md#7-site-optimization-requests-demand-driven-scope)).
Open an issue with the host URL, what breaks, your device, and screenshots.
Issues are triaged into labeled queues:

| Label          | Queue                              | Priority     |
| -------------- | ---------------------------------- | ------------ |
| `shield`       | ads leaking — filter-rule fix      | highest      |
| `site-profile` | rendering/responsive break on a host | high       |
| `perf`         | slow start, janky player           | high         |
| `safety`       | scammy host — isolate or warn      | as raised    |

## Ground rules for everything above

- Nothing may break the legal model
  ([PRD §6](docs/prd.md#6-legal--content-positioning)): no ripping, no DRM
  or paywall circumvention, no authentication bypass, no re-serving content.
- Honest statuses only: a feature is done when the code does it and a
  Maestro flow proves it on Android.
- Zero ads is a product requirement, not a best-effort.
