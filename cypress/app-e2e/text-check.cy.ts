/// <reference types="cypress" />

/**
 * Page 9 (text-check.html) proven against the REAL bundled app with every
 * `/api/v1` request destroyed at the network layer — so passing proves the
 * parse-preview tool runs fully on-device.
 *
 * Covers: the bundled "Check a text" page loads from IndexedDB (its language
 * picker is populated by GET /languages, served on-device) → a pasted text is
 * parsed on-device (POST /texts/check -> the local tokenizer) → the sentences,
 * word list (with counts) and non-word list render — all at apiAttempts === 0.
 * Like the tags page, it is reached by direct path: the navbar surfaces no
 * "Check" link, and the server's /text/check is a native form with no /api/v1
 * counterpart, so this is a local-first-only surface.
 */

const API = '**/api/v1/**';

describe('text-check page — bundled app, no server', () => {
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

  it('parses a pasted text into sentences + word counts, fully on-device', () => {
    // 1. Boot offline -> library (seeds the starter languages, English first).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. Open the parse-preview page directly (reached by path, not a nav link).
    cy.visit('/text-check.html');
    cy.get('#text-check-form', { timeout: 20000 }).should('be.visible');

    // 3. The language picker was filled from IndexedDB (GET /languages on-device).
    cy.get('#tc-language option', { timeout: 20000 })
      .its('length')
      .should('be.greaterThan', 0);
    cy.get('#tc-language').select('English');

    // 4. Paste a text and check it (POST /texts/check -> local tokenizer).
    cy.get('#tc-text').type('The cat sat. The cat ran.');
    cy.get('#tc-submit').click();

    // 5. The preview rendered on-device: two sentences, and "cat" counted twice.
    cy.get('#tc-results', { timeout: 20000 }).should('be.visible');
    cy.get('#tc-results ol li').should('have.length', 2);
    cy.get('#tc-results .wordlist').should('contain.text', 'cat');
    cy.get('#tc-results .wordlist').should('contain.text', '[cat] — 2');
    cy.get('#tc-results .nonwordlist li').its('length').should('be.greaterThan', 0);
    cy.screenshot('13-text-check', { capture: 'viewport' });

    // 6. The whole open -> check -> render flow ran with no server.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the text-check flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-text-check-api-attempts.txt', summary);
      expect(apiAttempts, 'no /api/v1 calls — the text-check page is fully on-device').to.equal(0);
    });
  });
});
