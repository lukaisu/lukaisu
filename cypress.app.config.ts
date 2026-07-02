import { defineConfig } from 'cypress';

/**
 * E2E config for the **bundled offline app** (`dist/`, the Capacitor/F-Droid
 * webDir), served statically with NO PHP server.
 *
 * Run:
 *   npm run build
 *   python3 -m http.server 8099 --directory dist &   # any static server
 *   npx cypress run --config-file cypress.app.config.ts
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8099',
    supportFile: 'cypress/app-e2e/support.ts',
    specPattern: 'cypress/app-e2e/**/*.cy.ts',
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 15000,
    video: false,
    screenshotOnRunFailure: true,
  },
});
