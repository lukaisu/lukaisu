/// <reference types="cypress" />

/**
 * The F-Droid milestone, proven end-to-end against the REAL bundled app
 * (`dist/`, served statically with no PHP) and with every `/api/v1` request
 * destroyed at the network layer. If any step depended on a server it would
 * fail; passing proves the read/learn path is fully on-device.
 *
 * Covered (the bundled, reachable surface): serverless boot + seed → library
 * from IndexedDB → reader with word-status highlighting → save a word offline →
 * review surface boots. NOT covered here (not bundled — see the report): the
 * create-language and import-text UI, which `bundledPageFor()` routes to a
 * remote server and which therefore dead-link in pure-offline mode.
 */

const API = '**/api/v1/**';

describe('offline milestone — bundled app, no server', () => {
  let apiAttempts = 0;
  let attemptedUrls: string[] = [];

  beforeEach(() => {
    apiAttempts = 0;
    attemptedUrls = [];
    // Poison every server call: prove the flow needs none of them.
    cy.intercept(API, (req) => {
      apiAttempts += 1;
      attemptedUrls.push(`${req.method} ${new URL(req.url).pathname}`);
      req.destroy();
    }).as('api');
  });

  it('boots serverless, seeds, reads with highlighting, saves a word, reviews', () => {
    // 1. First launch, no server configured -> on-device library (seeds starter
    //    content on the way).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. The library lists seeded texts entirely from IndexedDB.
    cy.get('a[href*="/read"]', { timeout: 20000 }).its('length').should('be.greaterThan', 0);

    // 3. Open a text -> the reader parses + renders tokens with status
    //    highlighting (unknown words carry .status0; CSS is inlined in the page).
    cy.get('a[href*="/read"]').first().click();
    cy.location('pathname').should('include', 'read.html');
    cy.get('.word', { timeout: 20000 }).its('length').should('be.greaterThan', 0);
    cy.get('.word.status0').its('length').should('be.greaterThan', 0);
    cy.get('.word').its('length').then((n) => cy.log(`reader rendered ${n} word tokens`));
    cy.screenshot('02-reader-highlighted', { capture: 'viewport' });

    // 4. Save a word with no server: click an unknown word, mark it Known via the
    //    popover; the highlight flips to well-known across its occurrences.
    cy.get('.word.status0').first().click();
    cy.get('.word-popover', { timeout: 10000 }).should('be.visible');
    cy.get('.word-popover').find('button.is-success').filter(':visible').first().click();
    cy.get('.word.status99', { timeout: 10000 }).its('length').should('be.greaterThan', 0);
    cy.get('.word.status99').its('length').then((n) => cy.log(`${n} occurrences now well-known`));

    // 5. The review surface boots and loads its config locally (no server).
    cy.visit('/review.html');
    cy.get('[x-data], #review-app, section', { timeout: 20000 }).should('exist');
    cy.get('#review-config', { timeout: 20000 }).should('exist');
    cy.screenshot('03-review-surface', { capture: 'viewport' });

    // 6. The whole flow ran without reaching for a server at all: every bundled
    //    surface (incl. navbar streak + reader audio/book-context chrome) is
    //    served on-device. Asserted to 0 so any new server dependency regresses
    //    here instead of silently degrading the offline experience.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the flow: ${apiAttempts}`);
      const summary = [`attempts: ${apiAttempts}`, ...attemptedUrls].join('\n');
      cy.writeFile('cypress/app-e2e/.last-run-api-attempts.txt', summary);
      expect(apiAttempts, 'no /api/v1 calls — the bundled app is fully on-device').to.equal(0);
    });
  });

  it('lists saved terms and edits one inline, with no server', () => {
    // 1. Boot offline -> library -> open a text and save a word, so the on-device
    //    terms store has a row for the list to show (the seed ships no terms).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');
    cy.get('a[href*="/read"]', { timeout: 20000 }).first().click();
    cy.location('pathname').should('include', 'read.html');
    cy.get('.word.status0', { timeout: 20000 }).first().click();
    cy.get('.word-popover', { timeout: 10000 }).should('be.visible');
    cy.get('.word-popover').find('button.is-success').filter(':visible').first().click();
    cy.get('.word.status99', { timeout: 10000 }).its('length').should('be.greaterThan', 0);

    // 2. The bundled terms list (words.html) renders that term entirely from
    //    IndexedDB — both /words and /words/edit route here via bundledPageFor().
    cy.visit('/words.html');
    cy.get('#word-list-config', { timeout: 20000 }).should('exist');
    cy.get('.clickedit:visible', { timeout: 20000 }).its('length').should('be.greaterThan', 0);

    // 3. Inline-edit a translation offline: open the editor, type, save; the cell
    //    reflects the new value (PUT /terms/{id}/inline-edit served on-device).
    cy.get('.clickedit:visible').first().click();
    cy.get('textarea:visible', { timeout: 10000 }).first().clear().type('e2e-offline-gloss');
    cy.get('button.is-success:visible').first().click();
    cy.contains('e2e-offline-gloss', { timeout: 10000 }).should('exist');
    cy.screenshot('05-terms-list-inline-edit', { capture: 'viewport' });

    // 4. The whole list + edit flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the terms flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the terms list is fully on-device').to.equal(0);
    });
  });

  it('edits a term in the standalone form and saves, with no server', () => {
    const gloss = `gloss-${Date.now()}`;

    // 1. Boot offline -> library -> open a text and save a word so a term exists.
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');
    cy.get('a[href*="/read"]', { timeout: 20000 }).first().click();
    cy.location('pathname').should('include', 'read.html');
    cy.get('.word.status0', { timeout: 20000 }).first().click();
    cy.get('.word-popover', { timeout: 10000 }).should('be.visible');
    cy.get('.word-popover').find('button.is-success').filter(':visible').first().click();
    cy.get('.word.status99', { timeout: 10000 }).its('length').should('be.greaterThan', 0);

    // 2. From the terms list, the per-row Edit link routes to word.html via
    //    bundledPageFor (/words/{id}/edit -> word.html?id={id}).
    cy.visit('/words.html');
    cy.get('a[href*="/edit"]:visible', { timeout: 20000 }).first().click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'word.html');

    // 3. The form loaded the term from IndexedDB (GET /terms/{id}); edit and save
    //    (PUT /terms/{id} -> updateFull), all on-device.
    cy.get('#word-edit-form', { timeout: 20000 }).should('be.visible');
    cy.get('#we-translation').clear().type(gloss);
    cy.get('#we-status').select('3');
    cy.get('#we-notes').clear().type('seen in chapter 1');
    cy.get('#we-submit').click();

    // 4. Back on the terms list, the edited translation is persisted.
    cy.location('pathname', { timeout: 20000 }).should('include', 'words.html');
    cy.contains(gloss, { timeout: 20000 }).should('exist');
    cy.screenshot('06-term-edited', { capture: 'viewport' });

    // 5. The whole edit flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the edit flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the term edit form is fully on-device').to.equal(0);
    });
  });

  it('lists languages and sets the current one, with no server', () => {
    // 1. Boot offline -> library, which seeds the starter languages + texts.
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. The bundled languages page (languages.html) lists the seeded languages
    //    entirely from IndexedDB — GET /languages + /languages/definitions are
    //    both served on-device by the local-first router.
    cy.visit('/languages.html');
    cy.get('[x-data="languageList"]', { timeout: 20000 }).should('exist');
    cy.contains('.box', 'All Languages', { timeout: 20000 }).should('exist');
    cy.get('table.is-fullwidth tbody tr', { timeout: 20000 })
      .its('length').should('be.greaterThan', 0);
    cy.contains('table.is-fullwidth tbody tr', 'English').should('exist');

    // 3. Set a non-current language as current offline (POST
    //    /languages/{id}/set-default served on-device); the success notice shows.
    cy.get('button[title="Set as Current"]:visible', { timeout: 10000 })
      .first()
      .click();
    cy.contains('.notification', 'is now the current language', { timeout: 10000 })
      .should('exist');
    cy.screenshot('07-languages-set-current', { capture: 'viewport' });

    // 4. The whole list + set-current flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the languages flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the languages list is fully on-device').to.equal(0);
    });
  });

  it('edits a language in the settings form and saves, with no server', () => {
    // 1. Boot offline -> library (seeds the starter languages).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 2. Open the languages list, then the per-row Edit link, which the link
    //    router maps /languages/{id}/edit -> language-edit.html?id={id}.
    cy.visit('/languages.html');
    cy.get('table.is-fullwidth tbody tr', { timeout: 20000 })
      .its('length').should('be.greaterThan', 0);
    cy.get('table.is-fullwidth tbody tr').first().find('a[title="Edit"]').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'language-edit.html');

    // 3. The form loaded the language from IndexedDB (GET /languages/{id}); the
    //    name prefilled.
    cy.get('#language-edit-form', { timeout: 20000 }).should('be.visible');
    cy.get('#le-name').invoke('val').should('not.be.empty');

    // 4. Edit a round-tripping field (text size) and save (PUT /languages/{id} ->
    //    updateLanguage, which also reparses the texts), all on-device.
    cy.get('#le-text-size').clear().type('150');
    cy.get('#le-submit').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'languages.html');

    // 5. Re-open the same language's edit form; the new size persisted in
    //    IndexedDB.
    cy.get('table.is-fullwidth tbody tr', { timeout: 20000 })
      .first().find('a[title="Edit"]').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'language-edit.html');
    cy.get('#le-text-size', { timeout: 20000 }).should('have.value', '150');
    cy.screenshot('08-language-edited', { capture: 'viewport' });

    // 6. The whole edit flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the language edit flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the language edit form is fully on-device').to.equal(0);
    });
  });

  it('archives a text, lists it on the bundled archived page, and unarchives it offline', () => {
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 1. The active library (textsGroupedApp) lists seeded texts from IndexedDB.
    //    Capture the first text's title, then archive it from its per-card menu
    //    (POST /texts/{id}/archive served on-device by the local-first router).
    cy.get('.text-card .card-header-title', { timeout: 20000 })
      .its('length').should('be.greaterThan', 0);
    cy.get('.text-card .card-header-title').first().invoke('text').then((raw) => {
      const title = raw.trim();
      cy.wrap(title).as('archivedTitle');

      cy.get('.text-card').first().find('.dropdown-trigger-link').click();
      cy.get('.text-card').first().find('.dropdown-menu').should('be.visible');
      cy.get('.text-card').first().contains('.dropdown-item', 'Archive').click();

      // After the reload, the archived text is gone from the active list.
      cy.contains('.text-card .card-header-title', title).should('not.exist');
    });

    // 2. The bundled archived page (texts.html) renders the archived text from
    //    IndexedDB (GET /languages/with-archived-texts + /texts/archived-by-language).
    cy.visit('/texts.html');
    cy.get('#archived-texts-grouped-config', { timeout: 20000 }).should('exist');
    cy.get('@archivedTitle').then((aTitle) => {
      const title = aTitle as unknown as string;
      cy.contains('.text-card.is-archived .card-header-title', title, { timeout: 20000 })
        .should('exist');
      cy.screenshot('09-archived-texts', { capture: 'viewport' });

      // 3. Unarchive it on-device (POST /texts/{id}/unarchive); it leaves the list.
      cy.contains('.text-card.is-archived', title)
        .contains('.card-footer-item', 'Unarchive').click();
      cy.contains('.text-card.is-archived .card-header-title', title, { timeout: 20000 })
        .should('not.exist');
    });

    // 4. The whole archive → list → unarchive flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the archived-texts flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the archived texts page is fully on-device').to.equal(0);
    });
  });

  it('edits a text (title + body) and the reader re-renders it, with no server', () => {
    const newTitle = `Edited ${Date.now()}`;

    // 1. Boot offline -> library; open the first text's Edit form from its
    //    per-card dropdown (/texts/{id}/edit -> text-edit.html?id={id}).
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');
    cy.get('.text-card', { timeout: 20000 }).its('length').should('be.greaterThan', 0);
    cy.get('.text-card').first().find('.dropdown-trigger-link').click();
    cy.get('.text-card').first().find('.dropdown-menu').should('be.visible');
    cy.get('.text-card').first().contains('.dropdown-item', 'Edit').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'text-edit.html');

    // 2. The form loaded the text from IndexedDB (GET /texts/{id}); the title
    //    prefilled. Rewrite the title and body, then save (PUT /texts/{id} ->
    //    updateText, which re-parses the new body), all on-device.
    cy.get('#text-edit-form', { timeout: 20000 }).should('be.visible');
    cy.get('#te-title').invoke('val').should('not.be.empty');
    cy.get('#te-title').clear().type(newTitle);
    cy.get('#te-text').clear().type('A zebrastripe appears. A zebrastripe vanishes.');
    cy.get('#te-submit').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // 3. The renamed text shows in the library; open its reader and confirm the
    //    new body re-tokenized (the made-up word renders as a token offline).
    cy.contains('.text-card .card-header-title', newTitle, { timeout: 20000 }).should('exist');
    cy.contains('.text-card', newTitle).find('a[href*="/read"]').first().click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'read.html');
    cy.contains('.word', 'zebrastripe', { timeout: 20000 }).should('exist');
    cy.screenshot('10-text-edited', { capture: 'viewport' });

    // 4. The whole edit -> reparse -> read flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the text edit flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the text edit form is fully on-device').to.equal(0);
    });
  });

  it('renames and deletes a tag on the bundled tags page, with no server', () => {
    // 1. Boot offline -> save a word (creates a term), then add a tag to it via
    //    the bundled term edit form (word.html), so the tag store has a row.
    cy.clearLocalStorage();
    cy.visit('/index.html');
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');
    cy.get('a[href*="/read"]', { timeout: 20000 }).first().click();
    cy.location('pathname').should('include', 'read.html');
    cy.get('.word.status0', { timeout: 20000 }).first().click();
    cy.get('.word-popover', { timeout: 10000 }).should('be.visible');
    cy.get('.word-popover').find('button.is-success').filter(':visible').first().click();
    cy.get('.word.status99', { timeout: 10000 }).its('length').should('be.greaterThan', 0);

    cy.visit('/words.html');
    cy.get('a[href*="/edit"]:visible', { timeout: 20000 }).first().click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'word.html');
    cy.get('#word-edit-form', { timeout: 20000 }).should('be.visible');
    cy.get('#we-tags').clear().type('e2e-tag');
    cy.get('#we-submit').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'words.html');

    // 2. The bundled tags page lists that tag from IndexedDB (GET /tags/manage).
    cy.visit('/tags.html');
    cy.get('#tg-content', { timeout: 20000 }).should('be.visible');
    cy.get('#tg-term-body tr', { timeout: 20000 }).should('have.length', 1);
    cy.get('#tg-term-body tr').first().find('input').should('have.value', 'e2e-tag');

    // 3. Rename it offline (PUT /tags/term/{id}); the change persists.
    cy.get('#tg-term-body tr').first().find('input').clear().type('e2e-renamed');
    cy.get('#tg-term-body tr').first().contains('button', 'Save').click();
    cy.get('#tg-notice', { timeout: 10000 }).should('be.visible').and('contain', 'Renamed');
    cy.visit('/tags.html');
    cy.get('#tg-term-body tr', { timeout: 20000 }).first().find('input').should('have.value', 'e2e-renamed');
    cy.screenshot('11-tags-managed', { capture: 'viewport' });

    // 4. Delete it offline (DELETE /tags/term/{id}); it leaves the store.
    cy.get('#tg-term-body tr').first().contains('button', 'Delete').click();
    cy.get('#tg-term-body tr').should('have.length', 0);
    cy.visit('/tags.html');
    cy.get('#tg-content', { timeout: 20000 }).should('be.visible');
    cy.get('#tg-term-body tr').should('have.length', 0);
    cy.get('#tg-term-empty').should('be.visible');

    // 5. The whole list -> rename -> delete flow ran on-device.
    cy.then(() => {
      cy.log(`/api/v1 calls attempted during the tags flow: ${apiAttempts}`);
      expect(apiAttempts, 'no /api/v1 calls — the tags page is fully on-device').to.equal(0);
    });
  });

  it('creates a language and pastes a text with no server', () => {
    cy.clearLocalStorage();
    // Unique name so the spec is re-runnable against a persisted IndexedDB.
    const langName = `E2E ${Date.now()}`;

    // Add a language from a preset (server form does a native POST; this one
    // drives the API client into IndexedDB). English so the Latin sample below
    // parses into words; rename it uniquely so the spec re-runs cleanly.
    cy.visit('/language.html');
    cy.get('#nl-preset', { timeout: 20000 }).should('exist').select('English');
    cy.get('#nl-name').clear().type(langName);
    cy.get('#nl-submit').click();
    cy.location('pathname', { timeout: 20000 }).should('include', 'library.html');

    // Paste a text in that language.
    cy.visit('/text.html');
    cy.get('#nt-lang', { timeout: 20000 }).find('option').should('have.length.greaterThan', 0);
    cy.get('#nt-lang').select(langName);
    cy.get('#nt-title').type('My pasted text');
    cy.get('#nt-text').type('The quick brown fox jumps over the lazy dog.');
    cy.get('#nt-submit').click();

    // Lands in the reader with the pasted (not seeded) text parsed + highlighted.
    cy.location('pathname', { timeout: 20000 }).should('include', 'read.html');
    cy.get('.word.status0', { timeout: 20000 }).its('length').should('be.greaterThan', 0);
    cy.contains('.word', 'quick').should('exist');
    cy.screenshot('04-pasted-text', { capture: 'viewport' });
  });
});
