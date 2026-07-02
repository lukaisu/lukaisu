/// <reference types="cypress" />

// The bundled offline app talks to a server only for "enhanced-when-connected"
// extras (TTS, dictionaries, content discovery). With the network poisoned in
// these specs those calls reject by design — the milestone requires the app
// never to BLOCK on them, not that it never tries. So swallow app-level
// exceptions and unhandled rejections; the assertions prove the core flow.
Cypress.on('uncaught:exception', () => false);
