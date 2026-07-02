# Lukaisu roadmap

Build-and-release roadmap for the app. The local-first architecture plan and the
client⇄server seam live in [`BRIEFING.md`](BRIEFING.md); the F-Droid release
runbook is in [`FDROID.md`](FDROID.md).

## v0.1 — working shell (done)

- [x] Capacitor 8 + system-WebView project, Android platform committed.
- [x] Connect screen: server URL → native `GET /api/v1/version` probe → persist
      in Preferences → navigate the WebView to the server. Relaunch returns to
      the saved server; back-navigation returns to the picker (no auto-connect
      loop); cleartext HTTP allowed for LAN self-hosts; `errorPath` fallback.
- [x] Debug APK builds (JDK 21, Gradle 8.14.3, AGP 8.13.0).

## v0.2 — brand & fit-and-finish (done)

- [x] Locked brand + `applicationId` — **Lukaisu** / `org.lukaisu.app`
      (lukaisu.org registered by the maintainer, 2026-06).
- [x] Brand launcher icons (adaptive + maskable, あ + A open-book mark) and
      light/dark splash, generated with `@capacitor/assets`.
- [x] On-device QA against a real server (login, registration, reading, review,
      audio, dictionary popups, Android Back ergonomics).
- [x] Version scheme: `versionName` = semver "MAJOR.MINOR.PATCH",
      `versionCode` = MAJOR\*10000 + MINOR\*100 + PATCH. Set to 0.2.0 / 200.

## v0.3 — F-Droid release pipeline (in progress)

See [`FDROID.md`](FDROID.md) for the full runbook.

- [x] Release signing wired (keystore from `keystore.properties`/env, gitignored,
      with an unsigned fallback).
- [x] Fully-FOSS build — no Google Mobile Services, no proprietary blobs.
- [~] Reproducible-build hygiene: Gradle/AGP/Node/JDK/SDK versions pinned and
      documented; bit-for-bit verification still to confirm.
- [~] Fastlane metadata (`fastlane/metadata/android/en-US/`): title, descriptions,
      changelog, and icon done. **Remaining:** phone screenshots.
- [x] Create + back up the release keystore (`keytool`), then `npm run apk:release`.
      Permanent key at `~/keys/lukaisu-release.jks` (passwords in the maintainer's
      password manager, SHA-256 fingerprint recorded); signed `app-release.apk`
      built and verified.
- [x] Stand up our own F-Droid repo (fdroidserver, static hosting) and publish the
      signed release there — **live at `https://fdroid.lukaisu.org/repo`** (served by
      the VPS Caddy; per-release = `rsync` the `repo/` dir). _Remaining:_ back up the
      repo index-signing key.
- [x] Wire the bundled frontend into the main-catalog build. **Resolved by the
      frontend relocation (Phase M, 2026-07):** this app now owns `webapp/`
      outright, so the F-Droid buildserver checking out only this repo is
      sufficient — no submodule needed. See [`FDROID.md`](FDROID.md) Step 5.
- [ ] Submit to the main F-Droid catalog (expect the "requires server"
      anti-feature note — weaker now the app is local-first).

## v0.4 — local-first app (in progress)

Turn Lukaisu from a thin client that requires a server into a local-first app
that works fully offline, where connecting a server is optional. The plan and the
client⇄server seam are in [`BRIEFING.md`](BRIEFING.md).

The reading frontend lives in this repo, under `webapp/` (moved from
`lukaisu-server/src/frontend/` in Phase M, 2026-07 — see
`lukaisu-server/docs-src/server/frontend-relocation.md`). The local-first data
layer (on-device Dexie DB, the TypeScript parsers, repositories, and first-run
seed content) is built and consumed here too.

- [x] Bundle the frontend (connect → library → reader) instead of fetching
      server-rendered pages (`npm run sync`).
- [x] On-device DB + TypeScript parsers + repositories so the read/save/review
      loop runs offline for space-separated and RTL languages; first-run seeds
      language presets and sample texts. Verified end-to-end on an Android
      emulator (offline: seed → library → reader → save word → review).
- [x] Make the bundled local-first build the default build (`apk:debug` /
      `apk:release` bundle the local-first frontend, not the legacy connect shell).
- [x] First-run UX: open to the local library and demote "connect a server" to an
      optional Settings action. The launch page shows a neutral splash while the
      on-device DB seeds (no connect-form flash), then opens the library; the
      connect/auth UI shows only via Preferences → Server ("Connect a server"),
      which also offers "Disconnect" once connected.
- [ ] On-device QA of the full offline slice on physical hardware.
- [x] CORS onboarding for the optional server path: the bundle is cross-origin,
      so a connected server must set `CORS_ALLOWED_ORIGINS=https://localhost`. A
      failed connect on the server step now shows a help block with that exact
      env line (the server already honours `CORS_ALLOWED_ORIGINS`; `.env.example`
      documents the app's `https://localhost` origin).

## Later

- [ ] **Sync** (local ⇄ server) — deferred. The local schema keeps per-row
      timestamps + a pending-op store so it can be added without a rewrite; the
      sync design lives in `lukaisu-server/BRIEFING.md`.
- [ ] **High-quality CJK, TTS, transcription, and content discovery without a
      server** — out of scope; these stay server-enhanced (char-by-char CJK
      fallback offline).
- [ ] **Play Store variant** with a default public instance.
