# Lukaisu — Local-First Migration Briefing

> **Audience:** the implementation agent working in this repo (`lukaisu`, the
> Capacitor/Android app).
> **Paired doc:** `lukaisu-server/BRIEFING.md` (the server). The shared sections
> (Goal, Seam) are identical in both so the two tracks compose.

## Mission

Turn Lukaisu from a **thin client that requires a server** into a **local-first
app that works fully offline**, where connecting a server is **optional**. The
app must own its **data** (on-device DB) and its **parsing** for the common
case, and call a server only for the few things a phone genuinely can't do.

## The shared goal (this is the milestone)

**A Lukaisu app installed from F-Droid must work with NO server.** A first-time
user installs the app, and — fully offline — can create a language, paste/import
a text, read it with word-status highlighting, save words, and review them.

This milestone is **mostly your work.** Concretely, "server optional" means:
**nothing on the critical read/learn path for space-separated and right-to-left
languages may require a server.** CJK (Japanese/Chinese) high-quality parsing,
content discovery, TTS, and transcription may be "enhanced-when-connected" —
they are *not* part of the no-server milestone.

## The client⇄server seam (shared contract — identical in both briefs)

| Bucket | Owner after migration | Examples |
|---|---|---|
| **Rendering** | **Client** (already TS; **Alpine → Svelte 5**) | reader, review surface, word popups, navbar, i18n — already in the bundled frontend |
| **Data / DB** | **Client** (on-device DB) | languages, texts, words/terms, sentences, word-occurrences, tags, settings, review scheduling |
| **NLP** | **Optional server (Python)** | CJK parse (MeCab/jieba), lemmatization (spaCy), TTS (Piper), Whisper transcription |
| **Outbound / network** | **Hybrid (revised 2026-06-26)** — see below | structured catalog *browse* on the **client**; everything else **optional server (Python)** |

**Rendering framework (2026-06-27): Alpine.js → Svelte 5.** The rendering bucket
is now a ~53k-line local-first SPA, past what Alpine's islands model is built
for. Svelte 5 gives real reactivity/components and is CSP-clean (no
`unsafe-eval`). Migration is **incremental** — Svelte islands coexist with Alpine
(Alpine owns only `x-data` nodes), highest-pain screens first; jQuery is dropped
as screens move, Bulma stays. End-to-end spike through to the F-Droid APK landed
on `spike/svelte-word-list` (in `lukaisu-server`). **First screen migrated:** the
bundled `words.html` now mounts a Svelte `WordList` island (full parity with the
old Alpine page) — so the APK you build already ships Svelte for the terms list.
Rationale: the server brief's seam / `lukaisu-server/docs-src/server/local-first.md`.

**Outbound split (2026-06-26).** The original seam put *all* outbound work on the
optional server because "a phone can't make arbitrary cross-origin requests
safely." That holds for arbitrary URLs, but not for the structured, fixed-host
catalogs: the bundled app runs in a Capacitor WebView with `CapacitorHttp`, which
is CORS-free, so low-SSRF-risk catalog browse can run client-side. The maintainer
chose the **Hybrid** option, so this bucket now splits:

- **Client (CORS-free via `CapacitorHttp`):** Gutendex (Project Gutenberg) and
  Global Digital Library browse/search, difficulty tiers + reader-level computed
  against on-device vocabulary, Gutenberg **plain-text** import (fetch → strip
  boilerplate → parse on-device), **GDL EPUB** import (download → unzip via
  fflate → walk the OPF spine → HTML→text → parse on-device), and the **coverage
  preview** for both Gutenberg (plain-text) and GDL (EPUB) books — sampled and
  scored against on-device vocabulary. Implemented in the shared frontend under
  `shared/offline/local/content/` and surfaced behind the home "Discover books"
  toggle.
- **Optional server (Python), unchanged:** Internet Archive, RSS feeds, YouTube
  transcripts, and **arbitrary web-URL** extraction (incl. coverage preview for
  non-Gutenberg URLs). The server also keeps its own **EPUB** upload/URL import
  flow for its web UI; only the *catalog* EPUB path (GDL) now runs client-side.
  These keep the SSRF guard and stay "enhanced-when-connected."

**Degradation rule:** with no server, CJK languages fall back to
character-by-character parsing (functional, lower quality). When a server is
connected, CJK uses the Python tokenizer, and discovery/TTS/transcription light
up. The app must never *block* on the server.

## Where you are today (start here)

- **The bundled local-first build is the default and shipping.** `npm run
  apk:debug` / `apk:release` build the server's frontend (connect → library →
  reader) from the sibling `lukaisu-server` repo, bundle it into the APK, and run
  it client-side against an **on-device database**. Rendering, the
  read/save/review loop, and the parsers all run with no network for
  space-separated and right-to-left languages.
- **The connect shell is now a legacy fallback.** The original vanilla-TS shell
  (`src/main.ts`) — which only probes `GET /api/v1/version`, stores the server URL
  in Capacitor **Preferences**, and points the WebView at a remote server — is
  still available behind `npm run apk:debug:connect-shell`, but it is no longer
  the default build.
- **On-device database is live.** A Dexie/IndexedDB store holds languages, texts,
  words, sentences, word-occurrences, tags, settings, and review scheduling;
  first run seeds language presets and sample texts. Verified end-to-end on an
  Android emulator (offline: seed → library → reader → save word → review). It
  keeps per-row timestamps + a pending-op store so sync stays addable later.
- **The frontend TS you bundle lives in the `lukaisu-server` repo** under
  `src/frontend/` and is built into this app (`dist-app`, via `npm run build:app`
  there). Treat that as the shared frontend for now (don't fork it); the
  on-device layer lives there under `src/frontend/js/shared/offline/`
  (Dexie/IndexedDB — `db.ts`, the text/word/language stores, sync-metadata +
  pending-op queue).
- **The F-Droid milestone is complete (2026-06-26).** The last three items are
  done and QA'd on physical hardware (Pixel 8a): the app **opens to the local
  library** (the launch page shows a neutral splash while the on-device DB seeds,
  then redirects — no connect-form flash); **"connect a server" is demoted to an
  optional Preferences → Server action** (with "Disconnect" once connected); and a
  failed server-step connect **surfaces the CORS requirement**
  (`CORS_ALLOWED_ORIGINS=https://localhost`) in a help block. A first-time user can
  install from F-Droid and, fully offline, create a language → paste a text → read
  with highlighting → save words → review. What's left now is **beyond the
  milestone**: F-Droid catalog plumbing (v0.3), Job B server-enhanced surfaces, and
  sync (see `ROADMAP.md`).

## Your scope (this repo + the shared frontend)

The crux: **the rendering already exists; invert the data layer from
"fetch `/api/v1`" to "read a local DB, optionally sync."** Sequence below —
**status: all steps (1–7) are done; the offline slice is QA'd on physical
hardware (Pixel 8a, 2026-06-26).** The milestone is met (see *Where you are
today* and `ROADMAP.md` v0.4).

1. **On-device database.** Pick the store and model it on the server schema.
   - Recommended start: **reuse the existing Dexie/IndexedDB prototype**
     (`shared/offline/db.ts`) — it runs in the Capacitor WebView with no native
     plugin and already sketches the right stores. Consider
     `@capacitor-community/sqlite` only if you hit IndexedDB limits.
   - Schema to mirror (from `lukaisu-server/db/schema/`): `languages`, `texts`,
     `words` (status 1–5/98/99, translation, romanization, notes, review
     scores), `sentences`, `word_occurrences`, `tags` + maps, `settings`. Single
     user, no `*UsID` scoping needed locally.

2. **Local data-access layer.** Put a repository interface between the rendering
   modules and the data. Today they call the API client
   (`src/frontend/js/shared/api/client.ts`, hitting `/api/v1`). Make the
   **local DB the default source**, and the remote API an **optional** secondary
   (for sync / server-enhanced features). Rendering code should not know whether
   a server exists.

3. **Port the parsers to TypeScript.** This is what frees the read path from the
   server. Port the **pure-PHP** `RegexParser` (space-separated + RTL) and
   `CharacterParser` (CJK fallback) from
   `lukaisu-server/src/Modules/Language/Infrastructure/Parser/` into TS. Drive
   them from the per-language regex settings already in the schema
   (`LgRegexpSplitSentences`, `LgRegexpWordCharacters`, `LgSplitEachChar`,
   `LgRightToLeft`, etc.). After this, text → sentences → word-occurrences
   happens on-device for the common case.

4. **Bundle starter content.** A fresh F-Droid install must have *something* to
   read with no server: ship a handful of **language presets** (the
   `languages/definitions` data already exists server-side) and **a few sample
   texts** (public-domain) seeded into the local DB on first run.

5. **First-run UX = local, not connect. — DONE (2026-06-26).** The app opens to
   the **local library** (a neutral launch splash covers the first-run seed, then
   redirects — no connect-form flash), and "connect a server" is an **optional**
   Preferences → Server action (with "Disconnect" once connected), unlocking CJK
   tokenization, lemmatization, TTS, transcription, content discovery, and (future)
   sync. The existing server-probe flow is kept, just no longer mandatory.

6. **Local review + settings.** Review scheduling (the `WoTodayScore` /
   `WoTomorrowScore` logic) and settings/theme/locale must run against the local
   DB so review works offline.

7. **Capacitor plumbing.** Add only what's needed for offline (filesystem for
   imports/bundled content; a SQLite plugin only if you outgrow IndexedDB).
   Preserve the FOSS/F-Droid constraints (no GMS, cleartext allowed for LAN
   self-hosts, system WebView).

## Reuse map

- **Offline DB prototype:** `lukaisu-server/src/frontend/js/shared/offline/`
  (Dexie schema, text/words/language stores, sync-metadata, pending-op queue).
- **API client to wrap/demote:** `lukaisu-server/src/frontend/js/shared/api/client.ts`.
- **Parsers to port:** `lukaisu-server/src/Modules/Language/Infrastructure/Parser/`.
- **Language presets:** the server's `languages/definitions` endpoint data.
- **App shell & config:** this repo's `src/main.ts`, `capacitor.config.ts`,
  `README.md`, `ROADMAP.md` (v0.4 local-first status, offline gates).

## Out of scope (for the F-Droid milestone)

- **Sync** — deferred (design lives in `lukaisu-server/BRIEFING.md`; coordinate,
  but don't build it for this milestone). Build the local DB so sync can be added
  later (keep per-row timestamps + a pending-op store), but ship local-only.
- **High-quality CJK without a server** — use the char-by-char fallback; real
  MeCab/jieba stays server-enhanced.
- **Content discovery / TTS / transcription without a server** — these are
  server-enhanced features, hidden/disabled when no server is connected.

## Open decisions & risks

- **Storage tech:** IndexedDB/Dexie (reuse, zero native deps) vs SQLite plugin
  (more robust, native dependency). Default to reusing Dexie; revisit only on
  real limits.
- **Frontend home:** the rendering TS currently lives in `lukaisu-server`. Don't
  fork it into this repo for the milestone — bundle the shared frontend.
  Relocating it into `lukaisu` is a later, coordinated decision.
- **Sync-readiness vs scope:** design the local schema so sync is *addable*
  (timestamps, tombstones, pending ops) without committing to a sync model now.
- **APK size:** bundling content + any WASM tokenizer affects size; keep starter
  content small and treat CJK WASM as optional/out-of-scope for the milestone.

---
*Paired with `lukaisu-server/BRIEFING.md`. Keep the shared "Goal" and "Seam"
sections in sync if either changes.*
