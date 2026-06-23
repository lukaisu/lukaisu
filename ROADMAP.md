# Lukaisu roadmap

Build-focused roadmap for the app. Ecosystem strategy (why F-Droid first, why
a configurable client, phases) lives in the upstream `lwt/ROADMAP.md` — read
that first.

## v0.1 — working shell (done)

- [x] Capacitor 8 + system WebView project, Android platform committed.
- [x] Connect screen: server URL → native `GET /api/v1/version` probe (no CORS
      needed) → persist in native Preferences → navigate WebView to the server.
- [x] Relaunch skips straight back to the saved server; back-navigation out of
      the web app returns to the connect screen (no auto-connect loop).
- [x] Cleartext HTTP allowed for LAN self-hosts; `errorPath` fallback page.
- [x] Debug APK builds (JDK 21, Gradle 8.14.3, AGP 8.13.0).

## v0.2 — fit & finish (next)

- [x] **Lock the real brand + `applicationId`** — **Lukaisu** /
      `org.lukaisu.app` (lukaisu.org registered by the maintainer, 2026-06).
- [x] Real launcher icons (adaptive + maskable) from the brand — the Lukaisu
      open-book mark (あ + A, navy on white). Source 1024px masters in `assets/`
      (`icon-foreground`/`icon-background`/`icon-only`, `splash`/`splash-dark`),
      generated into `android/res` with `@capacitor/assets generate --android`.
      Replaced the placeholder `public/icon.svg` and the default Capacitor
      mipmaps/teal-grid background. Regenerate: `npx @capacitor/assets generate
      --android --iconBackgroundColor '#FFFFFF' --iconBackgroundColorDark
      '#0D2440' --splashBackgroundColor '#FFFFFF' --splashBackgroundColorDark
      '#0D2440'`.
- [x] On-device QA pass against a real server (2026-06-11): login, registration,
      reading, review, audio playback, dictionary popups (`target=_blank`), and
      Android back-button ergonomics all verified. Two blockers found + fixed
      (word popover off-screen → lwt `bcd454520`; hardware Back → `0ed089b`).
      One known follow-up: back at the *server root* still exits the app (the
      connect-shell→server nav leaves no WebView back-entry).
- [x] Splash screen polish — brand mark centered, light + dark (`drawable-night`)
      variants, wired via the existing `AppTheme.NoActionBarLaunch` launch theme.
- [x] Decide `versionCode`/`versionName` scheme — `versionName` = semver
      "MAJOR.MINOR.PATCH"; `versionCode` = MAJOR*10000 + MINOR*100 + PATCH
      (monotonic, F-Droid/Play-safe). Set to 0.2.0 / 200; documented in
      `android/app/build.gradle` and kept in sync with `package.json`.

## v0.3 — release pipeline

See `FDROID.md` for the full runbook (exact commands).

- [x] Release signing config wired (`android/app/build.gradle` reads a keystore
      from `keystore.properties`/env, gitignored, with an unsigned fallback;
      `keystore.properties.sample` documents it). **Remaining (manual):** create
      + back up the actual release keystore (`keytool`), then `npm run apk:release`.
- [x] Removed the unused Google Mobile Services plugin from the Gradle build
      (no push notifications) — keeps the build fully FOSS for F-Droid's scanner.
- [~] Reproducible-build hygiene: Gradle/AGP/Node/JDK/SDK versions are pinned and
      documented (`FDROID.md`). Bit-for-bit verification still to confirm.
- [ ] Stand up **our own F-Droid repo** (fdroidserver, static hosting on the VPS
      Caddy — e.g. `fdroid.lukaisu.org`) and publish the signed release there.
- [~] Fastlane metadata (`fastlane/metadata/android/en-US/`): title, descriptions,
      changelog, and icon done. **Remaining:** phone screenshots.
- [ ] Then: submission to the main F-Droid catalog (expect the "requires
      server" anti-feature note).

## v0.4 — bundled client (Model B, in progress)

The current shipping app (Model A) navigates the WebView to the remote server,
so most pages are server-rendered. Model B instead **bundles the Lukaisu Server
frontend** (connect → library → reader) into the APK as static pages that boot
against a remote `/api/v1` with no PHP in the loop. The upstream lwt Phase 1
(shell-free reader/library + client i18n) unblocked this.

**How it's built** — the bundled pages are produced in the `lukaisu-server` repo
(its `npm run build:app` → `lukaisu-server/dist-app/`, a Vite "app" mode that
prerenders the real PHP views into static HTML so the Alpine scaffolds never
drift). This app consumes that output:

```bash
npm run sync:model-b        # build lukaisu-server's app, copy into dist/, cap sync
npm run apk:debug:model-b   # …and assemble the debug APK
# back to Model A: npm run build (rebuilds the connect shell into dist/)
```

- [x] First vertical slice: connect (login/register, bearer token) → library
      (text list, language switcher) → reader (word grid, popups). Auth + server
      URL persist in localStorage; in-app links route locally for bundled pages
      and fall back to the remote server's web UI for everything else (edit,
      review, imports).
- [ ] **CORS is now mandatory** (was optional under Model A): the bundle's
      origin is cross-origin to every server, so each server must set
      `CORS_ALLOWED_ORIGINS=https://localhost` (the Android `https` scheme
      origin). Surface this in the connect screen's error copy and onboarding.
- [ ] Bundle the **review** surface (adds audio/sound assets + its config flow)
      and a client-rendered global navbar (still PHP-rendered upstream).
- [ ] On-device QA of the bundled slice against a real server.

## Later — toward a local-first client (blocked on lwt Phase 1)

- [ ] Offline cache / sync — gated on `lwt` Phase 4 (conflict-resolution spike
      first; see the "sync is the underestimated monster" watch-out).
- [ ] Play Store variant with a default public instance — gated on `lwt`
      Phase 3 (hardened public instance).
