/// <reference types="cypress" />

/**
 * Feeds (feeds.html) — the first **server-enhanced (Job B)** surface, proven
 * against the REAL bundled app with every `/api/v1` request destroyed at the
 * network layer.
 *
 * Job B inverts the Job-A assertion. Job-A pages must work offline (zero API
 * fall-through *and* a working UI); Job-B pages must be **gated** offline:
 * hidden/disabled, with no fall-through request fired. So this spec proves the
 * opposite of the offline-milestone specs — that with no server connected the
 * feed-manager SPA never mounts:
 *
 *  - the languages page's `/feeds?…` link resolves to the bundled feeds.html
 *    (bundledPageFor), not a fall-through to a remote server;
 *  - feeds.html shows the "connect a server" notice and **removes** the SPA
 *    subtree (`#feeds-app` / `#feed-manager-app` gone), so none of the
 *    `/api/v1/feeds*` calls the SPA would make ever fire;
 *  - the notice's "Connect a server" button leads to the connect page.
 */

const API = '**/api/v1/**';

describe('feeds page — bundled app, no server (server-enhanced, gated)', () => {
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

  it('routes /feeds to the bundled page and gates it behind a connected server', () => {
    // 1. Boot offline -> library (seeds the starter languages).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. From the languages page, the per-language "Feeds" link (/feeds?…)
    //    resolves to the bundled feeds.html via bundledPageFor() — it does not
    //    fall through to a remote server.
    cy.visit('/languages.html');
    cy.get('a[href*="/feeds"]', { timeout: 20000 }).first().click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('include', 'feeds.html');

    // 3. No server connected: the page shows the "connect a server" notice and
    //    the feed-manager SPA is removed entirely (so it never mounts or calls
    //    /api/v1/feeds*).
    cy.get('#feeds-offline', { timeout: 20000 }).should('be.visible');
    cy.get('#feeds-app').should('not.exist');
    cy.get('#feed-manager-app').should('not.exist');

    // 4. The notice's call to action leads to the optional connect flow.
    cy.get('#feeds-connect').should('be.visible').click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('include', 'index.html');

    // 5. The whole flow fired no /api/v1 calls — feeds correctly never reaches
    //    the network when there is no server to reach.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the feeds flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-feeds-api-attempts.txt', summary);
      expect(apiAttempts, 'feeds is gated offline — no /api/v1 fall-through').to.equal(0);
    });
  });
});

/**
 * The other half of the Job-B contract: when a server *is* connected the
 * feed-manager SPA mounts and is functional. This proves the prerendered
 * `x-data="feedList()"` markup + the `$store.feedManager` store actually mount
 * under `@alpinejs/csp` in the bundle (the offline spec removes the SPA, so it
 * can't show this). The `/api/v1/feeds*` surface is stubbed — no real server.
 */
describe('feeds page — bundled app, server connected (server-enhanced, mounts)', () => {
  beforeEach(() => {
    // Catch-all first (lowest priority), then the specific stubs the page needs.
    cy.intercept('**/api/v1/**', { statusCode: 200, body: {} });
    cy.intercept('GET', '**/api/v1/i18n**', { statusCode: 200, body: {} });
    cy.intercept('GET', '**/api/v1/navbar', {
      statusCode: 200,
      body: {
        basePath: '',
        logoUrl: '',
        languages: [],
        currentLanguageId: 0,
        isMultiUser: false,
        showAdminItems: false,
        theme: { mode: 'light', counterpart: '', current: '', auto: true },
      },
    });
    cy.intercept('GET', '**/api/v1/feeds/list**', {
      statusCode: 200,
      body: {
        feeds: [],
        pagination: { page: 1, per_page: 10, total: 0, total_pages: 1 },
        languages: [],
      },
    }).as('feedsList');
  });

  it('mounts the feed-manager SPA against a connected server', () => {
    // Enter server-backed mode: a configured server URL (so initDataMode is not
    // local-first) and auth-optional (so the boot gate doesn't bounce to connect).
    cy.visit('/feeds.html', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.localStorage.setItem('lukaisu.apiServer', 'http://localhost:8099');
        win.localStorage.setItem('lukaisu.authOptional', '1');
      },
    });

    // The SPA loaded its (empty) feed list from the connected server...
    cy.wait('@feedsList');

    // ...the no-server notice stays hidden, and the feed-manager mounts: the
    // list view (an x-if on $store.feedManager.viewMode) rendered its action
    // card, which only happens if the registered components + store mounted.
    cy.get('#feeds-offline').should('not.be.visible');
    cy.get('#feed-manager-app', { timeout: 20000 }).should('be.visible');
    cy.contains('New Feed', { timeout: 20000 }).should('be.visible');
  });
});
