/**
 * Copy the bundled Lukaisu web app ("Model B") built in the sibling
 * `lukaisu-server` repo (`lukaisu-server/dist-app`, produced by
 * `npm run build:app` there) into this app's Capacitor `webDir` (`dist/`), so
 * `cap sync` ships it inside the APK.
 *
 * This replaces the Model A connect shell (`src/main.ts` → `dist/`) with the
 * bundled reader/library/connect pages. As of the local-first migration those
 * pages default to an on-device database and only talk to a remote `/api/v1`
 * when a server is connected. Re-run `npm run build` to go back to the Model A
 * shell.
 *
 * @license MIT
 */

import { cpSync, rmSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const source = resolve(repoRoot, '../lukaisu-server/dist-app');
const dest = resolve(repoRoot, 'dist');

if (!existsSync(source)) {
  console.error(
    `[pull-webapp] Not found: ${source}\n` +
      `Build it first in the lukaisu-server repo:  (cd ../lukaisu-server && npm run build:app)`
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
console.log(`[pull-webapp] Copied bundled web app:\n  ${source}\n  -> ${dest}`);
