/**
 * Theme CSS minifier and asset copier.
 *
 * This script processes theme folders from webapp/css/themes/ to dist/themes/.
 * CSS files are minified, other files (images, etc.) are copied as-is. Also
 * builds all base CSS files from webapp/css/base/ to dist/css/.
 *
 * The app's dark-mode toggle (ThemeToggle.svelte) constructs paths like
 * `dist/themes/Dark/` at runtime, so this is a required build step, not
 * optional tooling — see the `build`/`sync` scripts in package.json.
 *
 * Usage: node scripts/build-themes.js
 */

import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

const THEMES_SRC = 'webapp/css/themes';
const THEMES_DEST = 'dist/themes';
const BASE_CSS_SRC = 'webapp/css/base';
const BASE_CSS_DEST = 'dist/css';

/**
 * Simple CSS minifier - removes comments, extra whitespace, and newlines.
 * @param {string} css - The CSS content to minify
 * @returns {string} Minified CSS
 */
function minifyCSS(css) {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove newlines and carriage returns
    .replace(/[\r\n]+/g, '')
    // Collapse multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Remove spaces around special characters
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    // Remove trailing semicolons before closing braces
    .replace(/;}/g, '}')
    // Trim
    .trim();
}

/**
 * Process a single theme folder.
 * @param {string} themeName - Name of the theme folder
 */
async function processTheme(themeName) {
  const srcDir = join(THEMES_SRC, themeName);
  const destDir = join(THEMES_DEST, themeName);

  // Create destination directory if it doesn't exist
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // Read all files in the theme folder
  const files = await readdir(srcDir);

  for (const file of files) {
    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);

    // Skip directories
    const fileStat = await stat(srcPath);
    if (fileStat.isDirectory()) {
      continue;
    }

    if (extname(file).toLowerCase() === '.css') {
      // Minify CSS files
      const css = await readFile(srcPath, 'utf-8');
      const minified = minifyCSS(css);
      await writeFile(destPath, minified);
    } else {
      // Copy other files as-is
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Build all base CSS files from src/frontend/css/base/ to dist/css/.
 */
async function buildBaseCSS() {
  if (!existsSync(BASE_CSS_DEST)) {
    await mkdir(BASE_CSS_DEST, { recursive: true });
  }

  const files = await readdir(BASE_CSS_SRC);
  const cssFiles = files.filter(f => extname(f).toLowerCase() === '.css');

  for (const file of cssFiles) {
    const css = await readFile(join(BASE_CSS_SRC, file), 'utf-8');
    await writeFile(join(BASE_CSS_DEST, file), minifyCSS(css));
  }

  console.log(`Built ${cssFiles.length} base CSS files: ${cssFiles.join(', ')}`);
}

/**
 * Main function - process all themes.
 */
async function main() {
  await buildBaseCSS();

  // Ensure destination directory exists
  if (!existsSync(THEMES_DEST)) {
    await mkdir(THEMES_DEST, { recursive: true });
  }

  // Get all theme folders
  const entries = await readdir(THEMES_SRC, { withFileTypes: true });
  const themes = entries.filter(e => e.isDirectory()).map(e => e.name);

  for (const theme of themes) {
    await processTheme(theme);
  }

  console.log(`Processed ${themes.length} themes: ${themes.join(', ')}`);
}

main().catch(err => {
  console.error('Error building themes:', err);
  process.exit(1);
});
