/// <reference types="cypress" />

/**
 * Page 8 (settings.html) proven against the REAL bundled app with every
 * `/api/v1` request destroyed at the network layer — so passing proves the
 * preferences page is fully on-device.
 *
 * Covers: the navbar "Preferences" link now resolves to the bundled page (no
 * fall-through to a remote server) → the page loads from IndexedDB → the default
 * language is changed and persists across a reload (POST /settings
 * `currentlanguage` -> setCurrentLanguageId, served on-device). The interface-
 * language picker is disabled offline (only English is bundled), the honest
 * graceful degradation.
 */

const API = '**/api/v1/**';

describe('settings page — bundled app, no server', () => {
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

  it('opens from the navbar, changes the default language, and persists it offline', () => {
    // 1. Boot offline -> library (seeds the starter languages).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. The navbar "Preferences" link (/profile/preferences) now resolves to the
    //    bundled page via bundledPageFor() instead of falling through to a server.
    cy.get('a[href$="/profile/preferences"]', { timeout: 20000 })
      .first()
      .click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('include', 'settings.html');

    // 3. The form loaded from IndexedDB (GET /languages served on-device). The
    //    default-language select is populated from the seeded languages.
    cy.get('#settings-form', { timeout: 20000 }).should('be.visible');
    cy.get('#st-default-lang option', { timeout: 20000 })
      .its('length')
      .should('be.greaterThan', 1);

    // 4. Offline only English is bundled, so the interface-language picker is
    //    disabled and explains why.
    cy.get('#st-locale').should('be.disabled');
    cy.get('#st-locale-note').should('be.visible');

    // 4b. The optional Server section offers "Connect a server" (local-first);
    //     the "Disconnect" branch stays hidden since no server is connected.
    cy.get('#st-server-section').should('be.visible');
    cy.get('#st-connect-server').should('be.visible');
    cy.get('#st-server-connected').should('not.be.visible');

    // 5. Change the default language to a different seeded one and save
    //    (POST /settings currentlanguage -> setCurrentLanguageId, on-device).
    cy.get('#st-default-lang').then(($sel) => {
      const current = String($sel.val() ?? '');
      const options = Array.from($sel[0].querySelectorAll('option'))
        .map((o) => (o as HTMLOptionElement).value)
        .filter((v) => v !== '');
      const target = options.find((v) => v !== current);
      expect(target, 'a second language to switch to').to.be.a('string');
      cy.wrap(target).as('targetLang');
      cy.get('#st-default-lang').select(target as string);
    });
    cy.get('#st-submit').click();
    cy.get('#st-success', { timeout: 10000 }).should('be.visible');
    cy.screenshot('12-settings-saved', { capture: 'viewport' });

    // 6. Reload the page; the new default language persisted in IndexedDB.
    cy.visit('/settings.html');
    cy.get('#settings-form', { timeout: 20000 }).should('be.visible');
    cy.get('@targetLang').then((target) => {
      cy.get('#st-default-lang').should('have.value', target as unknown as string);
    });

    // 7. The whole open -> change -> persist flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the settings flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-settings-api-attempts.txt', summary);
      expect(apiAttempts, 'no /api/v1 calls — the settings page is fully on-device').to.equal(0);
    });
  });
});
