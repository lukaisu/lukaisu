# lwt-mobile roadmap

Build-focused roadmap for the app. Ecosystem strategy (why F-Droid first, why
a configurable client, phases) lives in `lwt/ROADMAP.md` — read that first.

## v0.1 — working shell (done)

- [x] Capacitor 8 + system WebView project, Android platform committed.
- [x] Connect screen: server URL → native `GET /api/v1/version` probe (no CORS
      needed) → persist in native Preferences → navigate WebView to the server.
- [x] Relaunch skips straight back to the saved server; back-navigation out of
      the web app returns to the connect screen (no auto-connect loop).
- [x] Cleartext HTTP allowed for LAN self-hosts; `errorPath` fallback page.
- [x] Debug APK builds (JDK 21, Gradle 8.14.3, AGP 8.13.0).

## v0.2 — fit & finish (next)

- [ ] **Lock the real brand + `applicationId`** — HARD GATE before any publish;
      package name is permanent once released.
- [ ] Real launcher icons (adaptive + maskable) from the final brand; replace
      the placeholder `public/icon.svg` and default Capacitor mipmaps
      (`@capacitor/assets` can generate from one 1024px source).
- [ ] On-device QA pass against a real server: login, registration, reading,
      review, audio playback, dictionary popups (`target=_blank` handling),
      Android back-button ergonomics inside the web app.
- [ ] Splash screen polish (current: Capacitor default).
- [ ] Decide `versionCode`/`versionName` scheme for releases.

## v0.3 — release pipeline

- [ ] Release signing config (keystore kept out of the repo).
- [ ] Reproducible-build hygiene: pin Gradle/AGP/Node versions, document the
      exact build environment (F-Droid needs `Builds:` metadata that rebuilds
      bit-for-bit or at least deterministically).
- [ ] Stand up **our own F-Droid repo** (fdroidserver, static hosting) and
      publish a signed release there.
- [ ] Fastlane metadata (`fastlane/metadata/android/`): description,
      screenshots, changelogs — F-Droid reads these.
- [ ] Then: submission to the main F-Droid catalog (expect the "requires
      server" anti-feature note).

## Later — toward a local-first client (blocked on lwt Phase 1)

- [ ] Bundle the LWT frontend (reading + review surfaces) into the APK once
      they run shell-free against `/api/v1` with client-side i18n
      (`lwt/ROADMAP.md` Phase 1). The connect screen already mirrors the
      server's `/connect` component (`client_auth.ts`) to ease that migration;
      at that point API calls become cross-origin and servers must set
      `CORS_ALLOWED_ORIGINS=https://localhost`.
- [ ] Offline cache / sync — gated on `lwt` Phase 4 (conflict-resolution spike
      first; see the "sync is the underestimated monster" watch-out).
- [ ] Play Store variant with a default public instance — gated on `lwt`
      Phase 3 (hardened public instance).
