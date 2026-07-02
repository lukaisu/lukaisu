# Lukaisu

**Lukaisu** (Finnish: *a quick read-through*) — `org.lukaisu.app`, named after
[lukaisu.org](https://lukaisu.org). The brand and `applicationId` are final
(the Android package name is permanent once published).

A **local-first** mobile app for learning languages by reading. Add a language,
paste in a text, and read it with every word colour-coded by how well you know
it; tap a word to save a translation, then build your vocabulary with built-in
spaced repetition. Everything is stored **on your device** and works **fully
offline** — no account, no server, no internet connection required.

Connecting a **[Lukaisu Server](https://github.com/lukaisu/lukaisu-server)** is
**optional**, and unlocks the things a phone can't do well on its own:
high-quality Chinese/Japanese word splitting, text-to-speech, audio
transcription, and discovering new texts online. The same pattern as the
Nextcloud mobile client: a free client for a self-hostable free server.

Targets **F-Droid first**, Play Store later. [MIT licensed](LICENSE).

## How it works

The app is a thin [Capacitor](https://capacitorjs.com/) shell over the
**system WebView** (no Chrome dependency — works on de-Googled phones). The
reading frontend, an **on-device database** (IndexedDB/Dexie), and the text
parsers are all bundled into the APK, so the core read/save/review loop runs
with no network:

1. **First run is local.** A fresh install seeds a few language presets and
   sample texts into the on-device DB and opens straight to your library — no
   server picker in the way.
2. **Reading happens on-device.** Texts are parsed into words locally (the
   space-separated and right-to-left parsers run in TypeScript); word status,
   translations, and review scheduling are stored and updated in the local DB.
3. **Connecting a server is optional.** A bundled **connect screen** validates a
   Lukaisu Server by probing `GET /api/v1/version`; once connected, the
   server-enhanced extras (CJK tokenization, TTS, transcription, online
   discovery) light up. With no server, CJK languages fall back to
   character-by-character parsing — functional, lower quality — and the app
   never blocks on the network.

The detailed plan for the migration from the old "window to a server" model to
local-first is in [`BRIEFING.md`](BRIEFING.md).

## Connecting a server (optional)

A server is only needed for the enhanced features above. When you connect one:

- Point the app at a **Lukaisu Server** (needs `GET /api/v1/version`; for
  multi-user login, the `/connect` flow). The API originated in LWT 3.x, so
  compatible LWT 3.1+ servers also work.
- **Plain-HTTP servers** (e.g. `http://192.168.1.10:8010` on your LAN) work — the
  app allows cleartext traffic. **Self-signed HTTPS certificates do not work** in
  the Android WebView; on a LAN prefer plain HTTP, or use a real certificate
  (e.g. Let's Encrypt / a reverse proxy).
- The bundled frontend calls the server **cross-origin**, so the server must
  allow the app's WebView origin via `CORS_ALLOWED_ORIGINS=https://localhost`.

## Building

Requirements: Node 20+, JDK **21** (Gradle 8.14 does not run on Java 25),
Android SDK (platform 36).

This repo owns the reading frontend outright (`webapp/` — reader, library,
on-device DB, parsers). No other checkout is involved:

```bash
npm install
npm run apk:debug           # build the app, bundle it, assemble the APK
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`apk:debug` chains `sync` — `build` (`vite build --config webapp.vite.config.ts`
→ `dist/`), `build:themes` (theme CSS the dark-mode toggle loads at runtime),
`cap sync` — then `gradlew assembleDebug`. Expects `JAVA_HOME`/`sdk.dir` to be
set up (`android/local.properties` holds `sdk.dir`).

Dev loop: `npm run dev` (Vite HMR against `webapp/`). `npm test` runs the
frontend's vitest suite; `npm run typecheck`/`npm run lint` cover TS + Svelte.

To test against a local Lukaisu Server: from a `lukaisu-server` checkout,
`docker compose up` (http://localhost:8010); set `MULTI_USER_ENABLED=true` in
its `.env` to exercise the login flow. For phone-on-LAN testing use the
machine's LAN IP.

## F-Droid

Plan (see [`FDROID.md`](FDROID.md) and [`ROADMAP.md`](ROADMAP.md)): publish
through **our own F-Droid repo first** to derisk the toolchain, then apply to the
main catalog. The build is fully FOSS — Gradle, Capacitor, androidx; no Google
Play Services, no proprietary blobs. The `NonFreeNet`-adjacent "requires a
server" remark is weaker now that the app is local-first and a server is
optional.

## Repository layout

- `webapp/` — the reading frontend (TypeScript, Svelte 5, CSS themes): reader,
  library, on-device DB, parsers. Owned here outright; `webapp.vite.config.ts`
  builds it, `webapp-tests/` tests it. Moved from `lukaisu-server` in 2026-07
  (Phase M of that repo's `docs-src/server/frontend-relocation.md`).
- `locale/en/` — a frozen duplicate of `lukaisu-server`'s English strings,
  bundled at build time as the offline i18n fallback
  (`webapp/js/shared/offline/local/i18n.ts`) for when no server is connected.
- `public/` — static WebView chrome (`error.html`, the app icon) copied into
  `dist/` at build time.
- `capacitor.config.ts` — app id/name, WebView navigation policy, cleartext.
- `android/` — the generated Capacitor Android project (committed, as is
  Capacitor convention; `local.properties` and build outputs are ignored).
- `BRIEFING.md` — the local-first migration plan; `ROADMAP.md` — the app/build
  roadmap; `FDROID.md` — the release runbook.

## Support

Lukaisu is free and non-profit. If you'd like to support its development, you can
donate on [Open Collective](https://opencollective.com/lukaisu).
