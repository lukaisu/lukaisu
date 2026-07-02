/**
 * Ambient module shim so the project's plain `tsc --noEmit` typecheck can
 * resolve `*.svelte` imports. The components themselves are type-checked by the
 * Svelte toolchain (the Vite build via `@sveltejs/vite-plugin-svelte`, and
 * `svelte-check` — the `check:svelte` script). This only keeps `tsc` green for
 * the `.ts` files that import a component.
 *
 * @license Unlicense <http://unlicense.org/>
 */
declare module '*.svelte' {
  import type { Component } from 'svelte';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: Component<any>;
  export default component;
}
