# Language Reader (lwt-mobile)

> **Codename.** "Language Reader" / `org.lwt_online.reader` are placeholders.
> The Android `applicationId` is **permanent once published** to F-Droid/Play —
> lock the final brand and package name **before the first release**.

A mobile client for **[LWT — Learning with Texts](https://github.com/HugoFara/lwt)**,
the self-hosted web app for learning languages by reading. Point the app at an
LWT server — your own self-hosted instance, or a public one — and read and
review on your phone. The same pattern as the Nextcloud mobile client: a free
client for a self-hostable free server.

Targets **F-Droid first**, Play Store later. [MIT licensed](LICENSE).

## How it works

The app is a thin [Capacitor](https://capacitorjs.com/) shell over the
**system WebView** (no Chrome dependency — works on de-Googled phones):

1. A small bundled **connect screen** asks for your LWT server address and
   validates it by probing the public `GET /api/v1/version` endpoint over
   native HTTP (so no CORS setup is needed on the server).
2. The choice is persisted natively; the WebView then navigates to the server.
3. From there you are using the LWT web app **same-origin on its own server**:
   login/registration (the server's `/connect` flow), bearer-token persistence,
   proactive token refresh, and session-expiry handling are all provided by the
   server's frontend. Relaunching the app skips straight back in.
4. Backing all the way out of the web app returns to the connect screen, where
   you can switch servers.

This is deliberately the "window to a server" model: LWT still renders most
pages server-side, so a fully offline client is not possible yet. As the LWT
frontend de-couples (Phase 1 in `lwt/ROADMAP.md`), this shell is positioned to
grow into a bundled local-first app — the connect screen already mirrors the
server's client-auth flow.

## Server requirements

- LWT **3.x or newer** (needs `/api/v1/version`; for multi-user login, the
  `/connect` flow shipped in 3.1.x).
- **No CORS configuration needed** for this app today. (`CORS_ALLOWED_ORIGINS`
  on the server only becomes relevant when the app starts making cross-origin
  API calls from bundled pages — i.e. the future local-first model. The app's
  WebView origin for that day is `https://localhost`.)
- Plain-HTTP servers (e.g. `http://192.168.1.10:8010` on your LAN) work — the
  app allows cleartext traffic. **Self-signed HTTPS certificates do not work**
  in the Android WebView; on a LAN prefer plain HTTP, or use a real certificate
  (e.g. Let's Encrypt / a reverse proxy).
- Single-user installs (no login) work too: the app just opens the server.

## Building

Requirements: Node 20+, JDK **21** (Gradle 8.14 does not run on Java 25),
Android SDK (platform 36).

```bash
npm install
npm run build            # typecheck + bundle the connect shell into dist/
npx cap sync android     # copy dist/ + plugins into the Android project
cd android && JAVA_HOME=~/.jdks/jdk-21.0.11+10 ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run apk:debug` chains all of the above (expects `JAVA_HOME`/`sdk.dir` to
be set up; `android/local.properties` holds `sdk.dir`).

Dev loop for the connect screen itself: `npm run dev` (note: in a plain
browser the version probe is a normal `fetch`, so the target server must allow
the dev origin via `CORS_ALLOWED_ORIGINS` — on-device builds don't need this).

To test against a local LWT server: from `lwt/`, `docker compose up`
(http://localhost:8010). For phone-on-LAN testing use the machine's LAN IP,
and set `MULTI_USER_ENABLED=true` in `lwt/.env` to exercise the login flow.

## F-Droid

Plan (see ROADMAP.md): publish through **our own F-Droid repo first** to derisk
the toolchain, then apply to the main catalog. The build is fully FOSS — Gradle,
Capacitor, androidx; no Google Play Services, no proprietary blobs. Expect the
`NonFreeNet`-adjacent "requires a server" remark; that is the accepted pattern
for clients of self-hostable services.

## Repository layout

- `index.html`, `src/`, `public/` — the bundled connect shell (vanilla
  TypeScript + Vite; no framework, keeps the APK small).
- `capacitor.config.ts` — app id/name, WebView navigation policy, cleartext.
- `android/` — the generated Capacitor Android project (committed, as is
  Capacitor convention; `local.properties` and build outputs are ignored).

Ecosystem strategy lives in `lwt/ROADMAP.md`; this repo's ROADMAP.md tracks
only the app/build side.
