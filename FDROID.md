# Releasing Lukaisu on F-Droid

Strategy (from `ROADMAP.md`): publish through **our own F-Droid repo first** to
de-risk the toolchain, then apply to the main F-Droid catalog. This file is the
runbook for both.

The build is already fully FOSS: Gradle + Capacitor + androidx, no Google Play
Services, no proprietary blobs. The web assets are built from source, and the GMS
plugin has been removed from the Gradle build.

> **Heads-up — the default build bundles a sibling repo.** Since the local-first
> migration, `npm run apk:debug` / `apk:release` build the shared reading frontend
> from the sibling **`lukaisu-server`** repo (`npm run build:app` → `dist-app`),
> copy it into this app's `dist/` (`npm run pull:webapp`), then `cap sync`. So a
> release build needs `lukaisu-server` checked out alongside this repo. The
> **legacy connect shell** (`src/` only, no sibling needed) still builds via
> `npm run apk:debug:connect-shell`, but it is no longer the app we ship.
>
> This has one consequence for the **main F-Droid catalog** (Step 5): its
> buildserver checks out only this repo, so a plain `npm run build` there would
> produce the *connect shell*, not the local-first app. The interim fix (a git
> submodule of `lukaisu-server`) is documented in Step 5 but **not yet wired**.
> As of the frontend's *Piece 1* decoupling, `build:app` reads only
> `lukaisu-server/src/frontend/` — no PHP views, partials, or locale — so that
> submodule build is now pure Node. The clean fix is *Piece 2*: relocating
> `src/frontend/` into this repo, after which no submodule is needed (see
> `lukaisu-server/BRIEFING.md` → *Rendering hollow-out*). The own-repo path below
> (Steps 1–4) is unaffected — you build locally with the sibling present.

---

## Build environment (pin this — F-Droid needs it reproducible)

| Tool        | Version            | Notes                                  |
|-------------|--------------------|----------------------------------------|
| Node        | 20+                | builds the bundled frontend (`build:app` in `lukaisu-server`) |
| JDK         | **21**             | Gradle 8.14 won't run on Java 25       |
| Gradle      | 8.14.3 (wrapper)   | `android/gradle/wrapper`               |
| AGP         | 8.13.0             | `android/build.gradle`                 |
| compileSdk  | 36                 | `android/variables.gradle`             |
| minSdk      | 24                 | `android/variables.gradle`             |

---

## Step 1 — Create the release keystore (one time, do this yourself)

The signing key is the app's permanent identity. **Back up the `.jks` file and
its passwords somewhere safe** — if you lose them, existing users can't upgrade.

```bash
keytool -genkeypair -v \
  -keystore lukaisu-release.jks \
  -alias lukaisu \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Lukaisu, O=Lukaisu, C=FI"
```

Store the keystore **outside the repo** (it's gitignored anyway). Then point the
build at it — copy the sample and fill in real values:

```bash
cp android/keystore.properties.sample android/keystore.properties
$EDITOR android/keystore.properties      # set storeFile to the .jks absolute path
```

The `storePassword`/`keyPassword` in this file **must match the passwords you
typed into `keytool`** above — leaving them as the sample `CHANGE_ME` fails with
`keystore password was incorrect`. With `-genkeypair`, if you reused the store
password for the key, set both to the same value.

(`android/keystore.properties` is gitignored. CI can use the
`LUKAISU_KEYSTORE_FILE` / `LUKAISU_KEYSTORE_PASSWORD` / `LUKAISU_KEY_ALIAS` /
`LUKAISU_KEY_PASSWORD` env vars instead.)

## Step 2 — Build and verify a signed release APK

`apk:release` first builds and bundles the shared frontend, so check out
**`lukaisu-server`** as a sibling of this repo (`../lukaisu-server`) — the script
runs `npm run build:app` there. It then runs `./gradlew` without setting
`JAVA_HOME`, so export JDK 21 first (Gradle 8.14 / AGP 8.13 do **not** run on the
system's Java 25):

```bash
export JAVA_HOME=~/.jdks/jdk-21.0.11+10
npm run apk:release
# → android/app/build/outputs/apk/release/app-release.apk
```

Verify the signature (apksigner ships in the Android SDK build-tools):

```bash
"$ANDROID_HOME"/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

If `apk:release` emits `app-release-unsigned.apk`, the keystore wasn't picked up
— check `android/keystore.properties` (or the env vars).

## Step 3 — Stand up our own F-Droid repo

Install the server tool (use a venv, per project convention):

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install fdroidserver
```

Initialise the repo (generates its own signing key, separate from the APK key):

```bash
mkdir -p ~/lukaisu-fdroid && cd ~/lukaisu-fdroid
fdroid init                       # creates config.yml + keystore.p12
mkdir -p metadata
cp /path/to/app-release.apk repo/ # drop signed APKs into repo/
```

Add app metadata at `~/lukaisu-fdroid/metadata/org.lukaisu.app.yml` (pull the
Fastlane texts from `fastlane/metadata/android/en-US/` in this repo). Then:

```bash
fdroid update --create-metadata    # builds index-v2.json, signs the index
```

Note the **repo fingerprint** it prints — users need it.

## Step 4 — Host it (static files on the VPS)

The repo is just static files (`repo/` + `index-v2.json`). Serve it from the
existing Caddy on the VPS — e.g. add an `fdroid.lukaisu.org` vhost pointing at
the repo dir, or a `/fdroid` path. Users then add:

```
https://fdroid.lukaisu.org/repo
```

…to their F-Droid client (Settings → Repositories → +), verifying the
fingerprint from Step 3.

## Per-release checklist

1. Bump `versionName` + `versionCode` in **both** `package.json` and
   `android/app/build.gradle` (scheme: `MAJOR*10000 + MINOR*100 + PATCH`).
2. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.
3. `git tag <versionName>` (the main catalog tracks releases by tag).
4. `npm run apk:release`, verify signature.
5. Copy the APK into the F-Droid repo's `repo/`, `fdroid update`, redeploy.

---

## Step 5 — Submit to the main F-Droid catalog (later)

Once the own-repo flow is proven:

1. Fork `https://gitlab.com/fdroid/fdroiddata`.
2. Add `metadata/org.lukaisu.app.yml` with a `Builds:` recipe. **The catalog
   buildserver checks out only this repo**, so it must also obtain the shared
   frontend from `lukaisu-server` to build the local-first app — a plain
   `npm run build` would ship the *legacy connect shell*. The interim fix is a
   **git submodule** of `lukaisu-server` pinned to a commit (F-Droid supports
   `submodules: true`); the recipe then:
   - sets `submodules: true`, `sudo`/`gradle`, and the SDK,
   - `prebuild`/`build`: `npm ci`, then in the submodule `npm ci && npm run
     build:app` — **pure Node since the *Piece 1* decoupling** (no PHP view or
     locale read at build time) — then `npm run pull:webapp` (point its source
     path at the submodule's `dist-app`) and `npx cap sync android`,
   - then `gradle: [assembleRelease]`.

   **Neither the submodule nor this recipe is wired yet.** The clean end state is
   *Piece 2* — relocating `lukaisu-server/src/frontend/` into this repo — after
   which the recipe is a single-repo `npm ci && … && cap sync` with **no
   submodule** (see `lukaisu-server/BRIEFING.md` → *Rendering hollow-out*). Until
   either lands, releases go through our own repo (Steps 1–4), where `apk:release`
   builds the bundle locally from the sibling checkout. Tracked in `ROADMAP.md`.
3. Set `AutoUpdateMode: Version` and `UpdateCheckMode: Tags` (hence the git tag).
4. Expect the **"requires a server"** anti-feature note (`NonFreeNet`-adjacent) —
   the accepted pattern for clients of self-hostable services, same as Nextcloud.
5. Open a merge request; F-Droid's buildserver rebuilds from source and signs
   with **their** key (so main-catalog installs differ in signature from our own
   repo — users pick one source and stick with it).

Screenshots for both: drop PNGs into
`fastlane/metadata/android/en-US/images/phoneScreenshots/` (`1.png`, `2.png`, …).
