import type { CapacitorConfig } from '@capacitor/cli';

/**
 * ⚠️ appId is a PLACEHOLDER CODENAME. The Android applicationId is permanent
 * once published to F-Droid/Play — lock the final brand + package name BEFORE
 * the first release (see ROADMAP.md). Derived from lwt-online.org, which the
 * maintainer controls (hyphens are not valid in package names → underscore).
 */
const config: CapacitorConfig = {
  appId: 'org.lwt_online.reader',
  appName: 'Language Reader',
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
