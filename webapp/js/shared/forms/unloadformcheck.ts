/**
 * Check for unsaved changes when unloading window.
 *
 * @license unlicense
 * @author  andreask7 <andreasks7@users.noreply.github.com>
 *          but also call ask_before_exiting once.
 */

import { setupTagChangeTracking } from '@shared/components/tagify_tags';

/**
 * Keeps track of a modified form.
 */
export const lukaisuFormCheck = {

  dirty: false,

  /**
   * Check the DIRTY status and ask before leaving.
   *
   * @returns Confirmation string
   */
  isDirtyMessage: function (): string | undefined {
    if (lukaisuFormCheck.dirty) {
      return '** You have unsaved changes! **';
    }
    return undefined;
  },

  /**
   * Set the DIRTY variable to 1.
   */
  makeDirty: function (): void {
    lukaisuFormCheck.dirty = true;
  },

  /**
   * Set the DIRTY variable to 0.
   */
  resetDirty: function (): void {
    lukaisuFormCheck.dirty = false;
  },

  /**
   * Called when a tag is changed (added or removed).
   *
   * @param duringInit - Whether this change happened during initialization
   */
  tagChanged: function (duringInit: boolean): void {
    if (!duringInit) {
      lukaisuFormCheck.dirty = true;
    }
  },

  /**
   * Call this function if you want to ask the user
   * before exiting the form.
   */
  askBeforeExit: function (): void {
    // Set up tag change tracking with Tagify
    setupTagChangeTracking(lukaisuFormCheck.tagChanged);

    // Add change listener to form elements (excluding quickmenu)
    document.querySelectorAll<HTMLElement>('input, textarea, select')
      .forEach(el => {
        if (el.id !== 'quickmenu') {
          el.addEventListener('change', lukaisuFormCheck.makeDirty);
        }
      });

    // Reset dirty on submit/reset clicks
    document.querySelectorAll<HTMLElement>('[type="reset"], [type="submit"]')
      .forEach(el => {
        el.addEventListener('click', lukaisuFormCheck.resetDirty);
      });

    // Warn before unload
    window.addEventListener('beforeunload', (e) => {
      const message = lukaisuFormCheck.isDirtyMessage();
      if (message) {
        e.preventDefault();
        return message;
      }
    });
  }
};
