# Releasing Lukaisu on F-Droid

Strategy (from `ROADMAP.md`): publish through **our own F-Droid repo first** to
de-risk the toolchain, then apply to the main F-Droid catalog. This file is the
runbook for both.

The build is already fully FOSS: Gradle + Capacitor + androidx, no Google Play
Services, no proprietary blobs. The web assets are built from source, and the GMS
plugin has been removed from the Gradle build.

> **Single-repo build (2026-07).** This app owns its frontend outright
> (`webapp/` — moved from `lukaisu-server` in *Piece 2* of that repo's
> `docs-src/server/frontend-relocation.md`). `npm run apk:debug` / `apk:release`
> build and bundle it from this checkout alone — no sibling repo, no submodule.
> This resolved the one blocker the main F-Droid catalog build (Step 5) used to
> have: its buildserver checks out only this repo, and now that's sufficient.

---

## Build environment (pin this — F-Droid needs it reproducible)

| Tool        | Version            | Notes                                  |
|-------------|--------------------|----------------------------------------|
| Node        | 20+                | builds the app (`webapp/`, via `webapp.vite.config.ts`) |
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

`apk:release` builds and bundles the app from this checkout alone. It runs
`./gradlew` without setting `JAVA_HOME`, so export JDK 21 first (Gradle 8.14 /
AGP 8.13 do **not** run on the system's Java 25):

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
2. Add `metadata/org.lukaisu.app.yml` with a `Builds:` recipe. **This app owns
   its frontend outright now** (`webapp/`, no sibling repo), so the catalog
   buildserver checking out only this repo is sufficient — no submodule, no
   two-repo build. The recipe is a plain single-repo build:
   - sets `sudo`/`gradle` and the SDK (no `submodules:`),
   - `prebuild`/`build`: `npm ci`, `npm run build`, `npm run build:themes`,
     `npx cap sync android` (i.e. what `npm run sync` chains),
   - then `gradle: [assembleRelease]`.

   **Not yet submitted.** Releases currently go through our own repo (Steps
   1–4). Tracked in `ROADMAP.md`.
3. Set `AutoUpdateMode: Version` and `UpdateCheckMode: Tags` (hence the git tag).
4. Expect the **"requires a server"** anti-feature note (`NonFreeNet`-adjacent) —
   the accepted pattern for clients of self-hostable services, same as Nextcloud.
5. Open a merge request; F-Droid's buildserver rebuilds from source and signs
   with **their** key (so main-catalog installs differ in signature from our own
   repo — users pick one source and stick with it).

Screenshots for both: drop PNGs into
`fastlane/metadata/android/en-US/images/phoneScreenshots/` (`1.png`, `2.png`, …).
