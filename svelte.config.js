// Svelte config for the bundled-client build. `vitePreprocess` enables
// `<script lang="ts">` in components; it is read by both
// `@sveltejs/vite-plugin-svelte` (vite.app.config.ts) and `svelte-check`
// (the `check:svelte` npm script).
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess()
};
