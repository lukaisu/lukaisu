/// <reference types="cypress" />

/**
 * Page 10 (home.html) proven against the REAL bundled app with every `/api/v1`
 * request destroyed at the network layer — so passing proves the dashboard is
 * assembled fully on-device.
 *
 * Covers: the bundled home dashboard loads from IndexedDB (its config — current
 * language, continue-reading text, that text's status stats, text count — is
 * resolved via GET /languages + GET /texts/by-language + GET /texts/statistics,
 * all served on-device) → the continue-reading card renders the seeded text with
 * Read/Review links — at apiAttempts === 0. The server-enhanced discovery
 * surfaces (Gutenberg/GDL suggestions, library search) are omitted offline.
 */

const API = '**/api/v1/**';

describe('home dashboard — bundled app, no server', () => {
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

  it('assembles the continue-reading dashboard fully on-device', () => {
    // 1. Boot offline -> library (seeds the starter languages + sample texts).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. Open the home dashboard (the navbar logo's "/" maps here via the router).
    cy.visit('/home.html');

    // 3. The dashboard mounted with its on-device config: the continue-reading
    //    card shows the seeded text (GET /texts/by-language + /texts/statistics).
    cy.get('#home-content', { timeout: 20000 }).should('be.visible');
    cy.get('#home-content .box .title.is-5', { timeout: 20000 })
      .invoke('text')
      .should('have.length.greaterThan', 0);
    cy.get('#home-content').contains('a', 'Read').should('be.visible');
    cy.get('#home-content').contains('a', 'New text').should('be.visible');
    cy.screenshot('14-home', { capture: 'viewport' });

    // 4. The whole dashboard assembled with no server.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the home flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-home-api-attempts.txt', summary);
      expect(apiAttempts, 'no /api/v1 calls — the home dashboard is fully on-device').to.equal(0);
    });
  });
});
