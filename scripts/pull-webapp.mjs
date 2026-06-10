/**
 * Copy the bundled LWT web app ("Model B") built in the sibling `lwt` repo
 * (`lwt/dist-app`, produced by `npm run build:app` there) into this app's
 * Capacitor `webDir` (`dist/`), so `cap sync` ships it inside the APK.
 *
 * This replaces the Model A connect shell (`src/main.ts` → `dist/`) with the
 * bundled reader/library/connect pages that boot against a remote `/api/v1`.
 * Re-run `npm run build` to go back to the Model A shell.
 *
 * @license MIT
 */

import { cpSync, rmSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const source = resolve(repoRoot, '../lwt/dist-app');
const dest = resolve(repoRoot, 'dist');

if (!existsSync(source)) {
  console.error(
    `[pull-webapp] Not found: ${source}\n` +
      `Build it first in the lwt repo:  (cd ../lwt && npm run build:app)`
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
console.log(`[pull-webapp] Copied bundled web app:\n  ${source}\n  -> ${dest}`);
