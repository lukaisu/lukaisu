/// <reference types="cypress" />

/**
 * Page 11 (text-print.html) proven against the REAL bundled app with every
 * `/api/v1` request destroyed at the network layer — so passing proves the
 * plain-print view is fully on-device.
 *
 * Covers: the reader's printer link (`/text/{id}/print-plain`) now resolves to
 * the bundled page (no fall-through to a remote server) → the page renders the
 * text's words from IndexedDB (GET /texts/{id}/print-items served on-device) →
 * the annotation filter is changed and persists across a reload (POST /settings
 * `currentprint*` -> setSetting, read back into the print config). The "Improved
 * Annotated Text" is server-only, so the page is plain-print and says so.
 */

const API = '**/api/v1/**';

describe('text-print page — bundled app, no server', () => {
  let apiAttempts = 0;
  let attemptedUrls: string[] = [];

  beforeEach(() => {
    apiAttempts = 0;
    attemptedUrls = [];
    cy.intercept(API, (req) => {
      apiAttempts += 1;
      attemptedUrls.push(`${req.method} ${new URL(req.url).pathname}`);
      req.destroy();
    }).as('api');
  });

  it('opens from the reader, renders the text, and persists the filter offline', () => {
    // 1. Boot offline -> library (seeds the starter languages + texts).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. Open a seeded text in the reader; its printer link carries the real id.
    cy.get('a[href*="/read"]', { timeout: 20000 }).first().click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'read.html');

    // 3. The reader's printer link (/text/{id}/print-plain) now resolves to the
    //    bundled page via bundledPageFor() instead of falling through to a server.
    cy.get('a[href*="/print-plain"]', { timeout: 20000 })
      .first()
      .click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('include', 'text-print.html');

    // 4. The print body rendered the text's items from IndexedDB.
    cy.get('#printoptions', { timeout: 20000 }).should('be.visible');
    cy.get('#print', { timeout: 20000 })
      .invoke('text')
      .should((text) => {
        expect(text.trim().length, 'printed text is non-empty').to.be.greaterThan(0);
      });

    // 5. Change the annotation filter and save (POST /settings currentprint* ->
    //    setSetting, on-device), then reload: it persisted in IndexedDB.
    cy.get('select[x-model="annotationFlags"]').select('1'); // Translation only
    cy.get('select[x-model="annotationFlags"]').should('have.value', '1');

    // Reload the same /text-print.html?text=N URL; the saved filter is read back
    // from IndexedDB into the print config.
    cy.reload();
    cy.get('#printoptions', { timeout: 20000 }).should('be.visible');
    cy.get('select[x-model="annotationFlags"]', { timeout: 20000 }).should('have.value', '1');

    // 6. The whole open -> render -> change -> persist flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the print flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-text-print-api-attempts.txt', summary);
      expect(apiAttempts, 'no /api/v1 calls — the print page is fully on-device').to.equal(0);
    });
  });
});
