import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import css from "@eslint/css";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Global ignores - these directories are completely excluded
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "assets/**",
      "coverage/**",
      "android/**",
      "webapp/js/third_party/**",
    ],
  },

  // JavaScript/TypeScript source files
  {
    files: ["webapp/{js,app}/**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // TypeScript-specific configuration
  {
    files: ["webapp/{js,app}/**/*.{ts,mts,cts}"],
    extends: [tseslint.configs.recommended],
  },

  // Svelte components. `eslint-plugin-svelte`'s flat "recommended" wires the
  // Svelte parser and rules. Two of its entries ship with no `files` filter,
  // so they'd apply globally — and `svelte/comment-directive` then crashes on
  // non-Svelte files (no Svelte parser services). Constrain those unscoped
  // entries to *.svelte so the Svelte rules only run on Svelte files.
  ...svelte.configs.recommended.map((config) =>
    config.files
      ? config
      : { ...config, files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"] }
  ),
  // Point the embedded `<script lang="ts">` (and `*.svelte.ts` / `*.svelte.js`
  // rune modules) at the TypeScript parser and supply browser globals. Without
  // the TS sub-parser the Svelte parser can't read TypeScript syntax (e.g.
  // `import { type Foo }`) in `*.svelte.ts` modules.
  {
    files: [
      "webapp/**/*.svelte",
      "webapp/**/*.svelte.ts",
      "webapp/**/*.svelte.js",
    ],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
      globals: globals.browser,
    },
  },

  // Test files (Cypress, Vitest, etc.)
  {
    files: ["webapp-tests/**/*.{js,ts}", "cypress/**/*.{js,ts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // TypeScript test files
  {
    files: ["webapp-tests/**/*.ts", "cypress/**/*.ts"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Allow namespace declarations for Cypress type augmentation
      "@typescript-eslint/no-namespace": "off",
      // Allow explicit any in tests (common for mocking)
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Config files (webapp.vite.config.ts, eslint.config.ts, etc.)
  {
    files: ["*.config.{js,ts}", "scripts/**/*.js", "scripts/**/*.mjs"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // TypeScript config files
  {
    files: ["*.config.ts"],
    extends: [tseslint.configs.recommended],
  },

  // CSS files (base styles and themes)
  {
    files: ["webapp/css/**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
    rules: {
      // Allow !important - this codebase legitimately uses !important for
      // overriding Bulma framework defaults and state/utility classes
      // (.is-loading, .lukaisu_selected_text, etc.). Refactoring to avoid
      // !important would require major CSS architecture changes.
      "css/no-important": "off",
      // The flagged properties (user-select, resize, accent-color) are
      // well-supported in all modern browsers since 2021-2022. Disabling to
      // avoid false positives.
      "css/use-baseline": "off",
      // Theme and chart CSS files reference custom properties defined in the
      // base styles.css :root block. The linter can't resolve cross-file
      // variables.
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
    },
  },
]);
