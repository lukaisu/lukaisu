import type { CapacitorConfig } from '@capacitor/cli';

/**
 * appId is FINAL: reverse-DNS of lukaisu.org (registered by the maintainer,
 * 2026-06). The Android applicationId is permanent once published to
 * F-Droid/Play — do not change it.
 */
const config: CapacitorConfig = {
  appId: 'org.lukaisu.app',
  appName: 'Lukaisu',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Self-hosters commonly run LWT over plain HTTP on a LAN; without this
    // Android blocks cleartext navigation outright.
    cleartext: true,
    // The whole point of this app is navigating to a *user-chosen* server,
    // so any origin must be allowed to load inside the WebView.
    allowNavigation: ['*'],
    // Local page shown if the WebView fails to load the remote app.
    errorPath: 'error.html'
  }
};

export default config;
