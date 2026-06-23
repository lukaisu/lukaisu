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
| **Rendering** | **Client** (already TS) | reader, review surface, word popups, navbar, i18n — already in the bundled frontend ("Model B") |
| **Data / DB** | **Client** (on-device DB) | languages, texts, words/terms, sentences, word-occurrences, tags, settings, review scheduling |
| **NLP** | **Optional server (Python)** | CJK parse (MeCab/jieba), lemmatization (spaCy), TTS (Piper), Whisper transcription |
| **Outbound / network** | **Optional server (Python)** | Gutenberg, Global Digital Library, Internet Archive, RSS feeds, YouTube transcripts, arbitrary web/EPUB URL extraction |

**Degradation rule:** with no server, CJK languages fall back to
character-by-character parsing (functional, lower quality). When a server is
connected, CJK uses the Python tokenizer, and discovery/TTS/transcription light
up. The app must never *block* on the server.

## Where you are today (start here)

- **Model A (shipping):** a vanilla-TS connect shell (`src/main.ts`) that probes
  `GET /api/v1/version`, stores the server URL in Capacitor **Preferences**, then
  points the WebView at the remote server. No offline capability beyond the
  connect screen.
- **Model B (in progress, v0.4):** bundles the server's frontend (connect →
  library → reader) as static pages in the APK, rendered client-side against
  `/api/v1`. **Rendering is already client-side** — the reader, word
  interactions, and (soon) review surface are TS, not server HTML.
- **No on-device database.** The only persisted state is the server URL (and an
  auth token). All real data still lives on the server and is fetched per-request.
- **The frontend TS you bundle lives in the `lukaisu-server` repo** under
  `src/frontend/` and is built into this app. Treat that as the shared frontend
  for now (don't fork it). It already contains a **prototype offline layer** you
  should build on: `src/frontend/js/shared/offline/` (Dexie/IndexedDB —
  `db.ts`, `offline-text-reader.ts`, sync-metadata + pending-op stores). It was
  scaffolded for exactly this and never wired up.

## Your scope (this repo + the shared frontend)

The crux: **the rendering already exists; invert the data layer from
"fetch `/api/v1`" to "read a local DB, optionally sync."** Sequence:

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

5. **First-run UX = local, not connect.** The app should open to a **local
   library**, not a server-picker. "Connect a server" becomes an **optional**
   action in Settings that unlocks CJK tokenization, lemmatization, TTS,
   transcription, content discovery, and (future) sync. Keep the existing
   server-probe flow, but demote it from mandatory to optional.

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
  `README.md`, `ROADMAP.md` (v0.4 Model B status, offline gates).

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
