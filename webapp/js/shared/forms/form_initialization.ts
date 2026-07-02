/**
 * Form initialization module.
 *
 * Handles automatic setup of form behaviors based on data attributes
 * and configuration passed from PHP via JSON.
 *
 * @license unlicense
 */

import { lukaisuFormCheck } from './unloadformcheck';

/**
 * Configuration for text edit form.
 */
interface TextEditFormConfig {
  languageData: Record<string, string>;
}

/**
 * Change the language attribute of text inputs based on selected language.
 * This helps browsers apply appropriate fonts and input methods.
 *
 * @param languageData - Mapping of language ID to language code
 */
export function changeTextboxesLanguage(languageData: Record<string, string>): void {
  const langSelect = document.getElementById('language_id') as HTMLSelectElement | null;
  if (!langSelect) return;

  const lid = langSelect.value;
  const langCode = languageData[lid] || '';

  const titleEl = document.getElementById('title');
  const textEl = document.getElementById('text');
  if (titleEl) titleEl.setAttribute('lang', langCode);
  if (textEl) textEl.setAttribute('lang', langCode);
}

/**
 * Initialize the text edit form.
 * Sets up language switching and form change tracking.
 */
export function initTextEditForm(): void {
  const configEl = document.getElementById('text-edit-config');
  if (!configEl) return;

  let config: TextEditFormConfig;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch (e) {
    console.error('Failed to parse text-edit-config:', e);
    return;
  }

  // Set up language change handler using data-action attribute
  const langSelect = document.querySelector('[data-action="change-language"]');
  if (langSelect) {
    langSelect.addEventListener('change', () => {
      changeTextboxesLanguage(config.languageData);
    });

    // Apply initial language
    changeTextboxesLanguage(config.languageData);
  }

  // Set up form change tracking
  lukaisuFormCheck.askBeforeExit();
}

/**
 * Initialize word edit forms.
 * Sets up form change tracking.
 */
export function initWordEditForm(): void {
  lukaisuFormCheck.askBeforeExit();
}

/**
 * Auto-initialize forms based on data attributes.
 * Called on DOMContentLoaded.
 */
export function autoInitializeForms(): void {
  // Auto-init text edit form if config is present
  if (document.getElementById('text-edit-config')) {
    initTextEditForm();
  }

  // Auto-init forms with data-lukaisu-form-check attribute
  const formsWithCheck = document.querySelectorAll('form[data-lukaisu-form-check="true"]');
  formsWithCheck.forEach((form) => {
    if (!form.hasAttribute('data-lukaisu-form-init')) {
      form.setAttribute('data-lukaisu-form-init', 'true');
      lukaisuFormCheck.askBeforeExit();
      // If form is marked as dirty, set dirty state
      if (form.hasAttribute('data-lukaisu-dirty')) {
        lukaisuFormCheck.makeDirty();
      }
    }
  });

  // Auto-init forms with validate class that need exit confirmation
  // This handles forms that have class="validate"
  const validateForms = document.querySelectorAll('form.validate');
  if (validateForms.length > 0) {
    let needsFormCheck = false;
    validateForms.forEach((form) => {
      if (!form.hasAttribute('data-lukaisu-form-init')) {
        form.setAttribute('data-lukaisu-form-init', 'true');
        needsFormCheck = true;
      }
    });
    if (needsFormCheck) {
      lukaisuFormCheck.askBeforeExit();
    }
  }

  // Auto-init language selector with data-language-data attribute
  const langConfigEl = document.getElementById('language-data-config');
  if (langConfigEl) {
    try {
      const languageData = JSON.parse(langConfigEl.textContent || '{}') as Record<string, string>;
      const langSelect = document.getElementById('language_id');
      if (langSelect) {
        // Apply initial language
        changeTextboxesLanguage(languageData);
        // Set up change handler
        langSelect.addEventListener('change', () => {
          changeTextboxesLanguage(languageData);
        });
      }
    } catch (e) {
      console.error('Failed to parse language-data-config:', e);
    }
  }
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', autoInitializeForms);
