/**
 * Tests for form_initialization.ts - Form initialization module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  changeTextboxesLanguage,
  initTextEditForm,
  initWordEditForm,
  autoInitializeForms
} from '../../webapp/js/shared/forms/form_initialization';

// Mock unloadformcheck
vi.mock('../../webapp/js/shared/forms/unloadformcheck', () => ({
  lukaisuFormCheck: {
    askBeforeExit: vi.fn()
  }
}));

import { lukaisuFormCheck } from '../../webapp/js/shared/forms/unloadformcheck';

describe('form_initialization.ts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // ===========================================================================
  // changeTextboxesLanguage Tests
  // ===========================================================================

  describe('changeTextboxesLanguage', () => {
    it('sets lang attribute on title and text', () => {
      document.body.innerHTML = `
        <select id="language_id">
          <option value="1">English</option>
          <option value="2">French</option>
        </select>
        <input id="title" type="text" />
        <textarea id="text"></textarea>
      `;

      const languageData = {
        '1': 'en',
        '2': 'fr'
      };

      const langSelect = document.getElementById('language_id') as HTMLSelectElement;
      langSelect.value = '2';

      changeTextboxesLanguage(languageData);

      expect(document.getElementById('title')?.getAttribute('lang')).toBe('fr');
      expect(document.getElementById('text')?.getAttribute('lang')).toBe('fr');
    });

    it('handles missing language select element', () => {
      document.body.innerHTML = `
        <input id="title" type="text" />
        <textarea id="text"></textarea>
      `;

      expect(() => changeTextboxesLanguage({ '1': 'en' })).not.toThrow();
    });

    it('sets empty string when language not in data', () => {
      document.body.innerHTML = `
        <select id="language_id">
          <option value="99">Unknown</option>
        </select>
        <input id="title" type="text" lang="en" />
        <textarea id="text" lang="en"></textarea>
      `;

      const langSelect = document.getElementById('language_id') as HTMLSelectElement;
      langSelect.value = '99';

      changeTextboxesLanguage({ '1': 'en' });

      expect(document.getElementById('title')?.getAttribute('lang')).toBe('');
      expect(document.getElementById('text')?.getAttribute('lang')).toBe('');
    });
  });

  // ===========================================================================
  // initTextEditForm Tests
  // ===========================================================================

  describe('initTextEditForm', () => {
    it('does nothing when config element does not exist', () => {
      expect(() => initTextEditForm()).not.toThrow();
      expect(lukaisuFormCheck.askBeforeExit).not.toHaveBeenCalled();
    });

    it('parses config from JSON and sets up language change handler', () => {
      document.body.innerHTML = `
        <script id="text-edit-config" type="application/json">
          {"languageData": {"1": "en", "2": "fr"}}
        </script>
        <select data-action="change-language" id="language_id">
          <option value="1">English</option>
          <option value="2">French</option>
        </select>
        <input id="title" type="text" />
        <textarea id="text"></textarea>
      `;

      initTextEditForm();

      // Initial language should be applied
      expect(document.getElementById('title')?.getAttribute('lang')).toBe('en');
      expect(document.getElementById('text')?.getAttribute('lang')).toBe('en');

      // Change language
      const langSelect = document.querySelector('[data-action="change-language"]') as HTMLSelectElement;
      langSelect.value = '2';
      langSelect.dispatchEvent(new Event('change'));

      expect(document.getElementById('title')?.getAttribute('lang')).toBe('fr');
      expect(document.getElementById('text')?.getAttribute('lang')).toBe('fr');
    });

    it('sets up form change tracking', () => {
      document.body.innerHTML = `
        <script id="text-edit-config" type="application/json">
          {"languageData": {}}
        </script>
      `;

      initTextEditForm();

      expect(lukaisuFormCheck.askBeforeExit).toHaveBeenCalled();
    });

    it('handles invalid JSON config gracefully', () => {
      document.body.innerHTML = `
        <script id="text-edit-config" type="application/json">
          {invalid json}
        </script>
      `;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => initTextEditForm()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // initWordEditForm Tests
  // ===========================================================================

  describe('initWordEditForm', () => {
    it('sets up form change tracking', () => {
      initWordEditForm();

      expect(lukaisuFormCheck.askBeforeExit).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // autoInitializeForms Tests
  // ===========================================================================

  describe('autoInitializeForms', () => {
    it('initializes text edit form when config is present', () => {
      document.body.innerHTML = `
        <script id="text-edit-config" type="application/json">
          {"languageData": {}}
        </script>
      `;

      autoInitializeForms();

      expect(lukaisuFormCheck.askBeforeExit).toHaveBeenCalled();
    });

    it('initializes forms with data-lukaisu-form-check attribute', () => {
      document.body.innerHTML = `
        <form data-lukaisu-form-check="true"></form>
        <form data-lukaisu-form-check="true"></form>
      `;

      autoInitializeForms();

      // Should call askBeforeExit for each form (but only once overall since it's global)
      expect(lukaisuFormCheck.askBeforeExit).toHaveBeenCalled();

      // Forms should be marked as initialized
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        expect(form.hasAttribute('data-lukaisu-form-init')).toBe(true);
      });
    });

    it('does not re-initialize forms already marked', () => {
      document.body.innerHTML = `
        <form data-lukaisu-form-check="true" data-lukaisu-form-init="true"></form>
      `;

      vi.clearAllMocks();

      autoInitializeForms();

      // askBeforeExit should not be called for already-initialized form
      expect(lukaisuFormCheck.askBeforeExit).not.toHaveBeenCalled();
    });

    it('marks validate class forms as initialized', () => {
      document.body.innerHTML = `
        <form class="validate"></form>
        <form class="validate"></form>
      `;

      autoInitializeForms();

      const forms = document.querySelectorAll('form.validate');
      forms.forEach(form => {
        expect(form.hasAttribute('data-lukaisu-form-init')).toBe(true);
      });
    });

    it('does not re-mark already initialized validate forms', () => {
      document.body.innerHTML = `
        <form class="validate" data-lukaisu-form-init="true"></form>
      `;

      autoInitializeForms();

      const form = document.querySelector('form.validate')!;
      expect(form.getAttribute('data-lukaisu-form-init')).toBe('true');
    });
  });
});
