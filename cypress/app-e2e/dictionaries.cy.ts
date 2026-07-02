/// <reference types="cypress" />

/**
 * Local dictionaries (dictionaries.html) — server-enhanced (Job B, surface 3).
 *
 *  - **Offline (local-first):** the page is gated — `#dicts-app` is removed and a
 *    "connect a server" notice is shown, with zero `/api/v1` fall-through.
 *  - **Connected:** the management UI mounts — it lists the language's
 *    dictionaries (stubbed server), one-click imports a curated dictionary
 *    (`POST /local-dictionaries/import-curated`), deletes a dictionary, and points
 *    the file-import affordance at the server's own web upload form.
 */

const API = '**/api/v1/**';

describe('dictionaries page — bundled app, no server (gated)', () => {
  let apiAttempts = 0;

  beforeEach(() => {
    apiAttempts = 0;
    cy.intercept(API, (req) => {
      apiAttempts += 1;
      req.destroy();
    }).as('api');
  });

  it('removes the management UI and offers the connect flow offline', () => {
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    cy.visit('/dictionaries.html');
    cy.get('#dicts-offline', { timeout: 20000 }).should('be.visible');
    cy.get('#dicts-app').should('not.exist');

    cy.get('#dicts-connect').should('be.visible').click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('include', 'index.html');

    cy.then(() => {
      expect(apiAttempts, 'dictionaries is gated offline — no /api/v1 fall-through').to.equal(0);
    });
  });
});

describe('dictionaries page — bundled app, server connected (manage + curated import)', () => {
  let dicts: Array<Record<string, unknown>>;

  beforeEach(() => {
    dicts = [{ id: 1, name: 'Test Dict', source_format: 'csv', entry_count: 42, enabled: true }];

    cy.intercept('**/api/v1/**', { statusCode: 200, body: {} });
    cy.intercept('GET', '**/api/v1/i18n**', { statusCode: 200, body: {} });
    cy.intercept('GET', '**/api/v1/navbar', {
      statusCode: 200,
      body: {
        basePath: '', logoUrl: '', languages: [], currentLanguageId: 0,
        isMultiUser: false, showAdminItems: false,
        theme: { mode: 'light', counterpart: '', current: '', auto: true },
      },
    });
    cy.intercept('GET', '**/api/v1/languages', {
      statusCode: 200,
      body: { languages: [{ id: 1, name: 'Test Language' }], currentLanguageId: 1 },
    });
    cy.intercept('GET', '**/api/v1/local-dictionaries*', (req) => {
      req.reply({ statusCode: 200, body: { dictionaries: dicts, mode: 1 } });
    }).as('list');
    cy.intercept('DELETE', '**/api/v1/local-dictionaries/*', (req) => {
      dicts = [];
      req.reply({ statusCode: 200, body: { success: true } });
    }).as('del');
    cy.intercept('POST', '**/api/v1/local-dictionaries/import-curated', {
      statusCode: 200,
      body: { success: true, imported: 123 },
    }).as('curated');
  });

  function visitConnected(): void {
    cy.visit('/dictionaries.html?lang=1', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.localStorage.setItem('lukaisu.apiServer', 'http://localhost:8099');
        win.localStorage.setItem('lukaisu.authOptional', '1');
      },
    });
    cy.get('#dicts-main', { timeout: 20000 }).should('be.visible');
  }

  it('lists the language dictionaries, imports a curated one, and links file import out', () => {
    visitConnected();
    cy.wait('@list');

    // The language picker + the existing dictionary table populated from the server.
    cy.get('#dicts-lang option').should('contain.text', 'Test Language');
    cy.get('#dicts-table').should('be.visible');
    cy.get('#dicts-tbody').should('contain.text', 'Test Dict').and('contain.text', '42');

    // The curated list (bundled registry) has importable sources.
    cy.get('#dicts-curated-select option').its('length').should('be.greaterThan', 0);

    // File import points at the connected server's own web upload form.
    cy.get('#dicts-file-link').should('have.attr', 'href', '/dictionaries/import?lang=1');

    // One-click curated import reports the server-side result.
    cy.get('#dicts-curated-import').click();
    cy.wait('@curated').its('request.body').should('include', { language_id: 1 });
    cy.get('#dicts-curated-status', { timeout: 20000 }).should('contain.text', '123');
  });

  it('deletes a dictionary', () => {
    cy.on('window:confirm', () => true);
    visitConnected();
    cy.wait('@list');
    cy.get('#dicts-tbody').should('contain.text', 'Test Dict');

    cy.get('#dicts-tbody [data-dict-del]').click();
    cy.wait('@del');
    // The reload now returns no dictionaries -> empty state.
    cy.get('#dicts-empty', { timeout: 20000 }).should('be.visible');
    cy.get('#dicts-table').should('not.be.visible');
  });
});
