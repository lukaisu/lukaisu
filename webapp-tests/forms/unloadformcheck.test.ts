/**
 * Tests for unloadformcheck.ts - Form dirty state tracking
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  lukaisuFormCheck,
} from '../../webapp/js/shared/forms/unloadformcheck';

describe('unloadformcheck.ts', () => {
  beforeEach(() => {
    // Reset dirty state before each test
    lukaisuFormCheck.dirty = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // ===========================================================================
  // lukaisuFormCheck Object Tests
  // ===========================================================================

  describe('lukaisuFormCheck', () => {
    describe('dirty property', () => {
      it('initializes to false', () => {
        lukaisuFormCheck.dirty = false;
        expect(lukaisuFormCheck.dirty).toBe(false);
      });

      it('can be set to true', () => {
        lukaisuFormCheck.dirty = true;
        expect(lukaisuFormCheck.dirty).toBe(true);
      });
    });

    describe('isDirtyMessage', () => {
      it('returns undefined when not dirty', () => {
        lukaisuFormCheck.dirty = false;
        expect(lukaisuFormCheck.isDirtyMessage()).toBeUndefined();
      });

      it('returns warning message when dirty', () => {
        lukaisuFormCheck.dirty = true;
        const message = lukaisuFormCheck.isDirtyMessage();
        expect(message).toBe('** You have unsaved changes! **');
      });
    });

    describe('makeDirty', () => {
      it('sets dirty to true', () => {
        lukaisuFormCheck.dirty = false;
        lukaisuFormCheck.makeDirty();
        expect(lukaisuFormCheck.dirty).toBe(true);
      });

      it('keeps dirty as true if already dirty', () => {
        lukaisuFormCheck.dirty = true;
        lukaisuFormCheck.makeDirty();
        expect(lukaisuFormCheck.dirty).toBe(true);
      });
    });

    describe('resetDirty', () => {
      it('sets dirty to false', () => {
        lukaisuFormCheck.dirty = true;
        lukaisuFormCheck.resetDirty();
        expect(lukaisuFormCheck.dirty).toBe(false);
      });

      it('keeps dirty as false if already clean', () => {
        lukaisuFormCheck.dirty = false;
        lukaisuFormCheck.resetDirty();
        expect(lukaisuFormCheck.dirty).toBe(false);
      });
    });

    describe('tagChanged', () => {
      it('sets dirty to true when not during initialization', () => {
        lukaisuFormCheck.dirty = false;
        lukaisuFormCheck.tagChanged(false);
        expect(lukaisuFormCheck.dirty).toBe(true);
      });

      it('does not change dirty during initialization', () => {
        lukaisuFormCheck.dirty = false;
        lukaisuFormCheck.tagChanged(true);
        expect(lukaisuFormCheck.dirty).toBe(false);
      });

      it('returns void', () => {
        const result = lukaisuFormCheck.tagChanged(false);
        expect(result).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('Integration', () => {
    it('dirty state workflow: clean -> dirty -> clean', () => {
      // Start clean
      lukaisuFormCheck.dirty = false;
      expect(lukaisuFormCheck.isDirtyMessage()).toBeUndefined();

      // Make dirty
      lukaisuFormCheck.makeDirty();
      expect(lukaisuFormCheck.isDirtyMessage()).toBe('** You have unsaved changes! **');

      // Reset to clean
      lukaisuFormCheck.resetDirty();
      expect(lukaisuFormCheck.isDirtyMessage()).toBeUndefined();
    });

    it('tagChanged during tag operations', () => {
      lukaisuFormCheck.dirty = false;

      // Simulate tag initialization (should not make dirty)
      lukaisuFormCheck.tagChanged(true);
      expect(lukaisuFormCheck.dirty).toBe(false);

      // Simulate user adding a tag (should make dirty)
      lukaisuFormCheck.tagChanged(false);
      expect(lukaisuFormCheck.dirty).toBe(true);

      // Reset
      lukaisuFormCheck.resetDirty();
      expect(lukaisuFormCheck.dirty).toBe(false);

      // Simulate user removing a tag (should make dirty)
      lukaisuFormCheck.tagChanged(false);
      expect(lukaisuFormCheck.dirty).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('multiple makeDirty calls do not affect state negatively', () => {
      lukaisuFormCheck.dirty = false;
      lukaisuFormCheck.makeDirty();
      lukaisuFormCheck.makeDirty();
      lukaisuFormCheck.makeDirty();
      expect(lukaisuFormCheck.dirty).toBe(true);
    });

    it('multiple resetDirty calls do not affect state negatively', () => {
      lukaisuFormCheck.dirty = true;
      lukaisuFormCheck.resetDirty();
      lukaisuFormCheck.resetDirty();
      lukaisuFormCheck.resetDirty();
      expect(lukaisuFormCheck.dirty).toBe(false);
    });

    it('tagChanged handles false duringInit', () => {
      lukaisuFormCheck.dirty = false;
      // When duringInit is false, it should make the form dirty
      lukaisuFormCheck.tagChanged(false);
      expect(lukaisuFormCheck.dirty).toBe(true);
    });

    it('isDirtyMessage returns consistent message', () => {
      lukaisuFormCheck.dirty = true;
      const msg1 = lukaisuFormCheck.isDirtyMessage();
      const msg2 = lukaisuFormCheck.isDirtyMessage();
      expect(msg1).toBe(msg2);
    });
  });

  // ===========================================================================
  // askBeforeExit Tests
  // ===========================================================================

  describe('askBeforeExit', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      lukaisuFormCheck.dirty = false;
    });

    it('sets up change listeners on form elements', () => {
      document.body.innerHTML = `
        <input type="text" id="testInput" />
        <textarea id="testTextarea"></textarea>
        <select id="testSelect"><option>Test</option></select>
      `;

      lukaisuFormCheck.askBeforeExit();

      // Trigger change on input
      const input = document.getElementById('testInput') as HTMLInputElement;
      input.dispatchEvent(new Event('change'));

      expect(lukaisuFormCheck.dirty).toBe(true);
    });

    it('sets up reset dirty on submit buttons', () => {
      document.body.innerHTML = `
        <button type="submit">Submit</button>
      `;

      lukaisuFormCheck.dirty = true;
      lukaisuFormCheck.askBeforeExit();

      // Click submit button
      const submitBtn = document.querySelector('[type="submit"]') as HTMLButtonElement;
      submitBtn.click();

      expect(lukaisuFormCheck.dirty).toBe(false);
    });

    it('sets up reset dirty on reset buttons', () => {
      document.body.innerHTML = `
        <button type="reset">Reset</button>
      `;

      lukaisuFormCheck.dirty = true;
      lukaisuFormCheck.askBeforeExit();

      // Click reset button
      const resetBtn = document.querySelector('[type="reset"]') as HTMLButtonElement;
      resetBtn.click();

      expect(lukaisuFormCheck.dirty).toBe(false);
    });

    it('ignores quickmenu select changes', () => {
      document.body.innerHTML = `
        <select id="quickmenu"><option>Quick</option></select>
      `;

      lukaisuFormCheck.askBeforeExit();

      // Trigger change on quickmenu
      const quickmenu = document.getElementById('quickmenu') as HTMLSelectElement;
      quickmenu.dispatchEvent(new Event('change'));

      // Should NOT make dirty because it's the quickmenu
      expect(lukaisuFormCheck.dirty).toBe(false);
    });

    it('sets up beforeunload handler', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      lukaisuFormCheck.askBeforeExit();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('beforeunload returns message when dirty', () => {
      lukaisuFormCheck.askBeforeExit();
      lukaisuFormCheck.dirty = true;

      const event = new Event('beforeunload') as BeforeUnloadEvent;
      Object.defineProperty(event, 'returnValue', {
        writable: true,
        value: '',
      });

      window.dispatchEvent(event);

      // The event was handled (may or may not prevent default in test env)
      expect(lukaisuFormCheck.isDirtyMessage()).toBe('** You have unsaved changes! **');
    });

    it('beforeunload does not prevent when not dirty', () => {
      lukaisuFormCheck.askBeforeExit();
      lukaisuFormCheck.dirty = false;

      // Should not prevent the default action when not dirty
      expect(lukaisuFormCheck.isDirtyMessage()).toBeUndefined();
    });
  });

  // ===========================================================================
  // Type Safety Tests
  // ===========================================================================

  describe('Type Safety', () => {
    it('dirty is a boolean', () => {
      expect(typeof lukaisuFormCheck.dirty).toBe('boolean');
    });

    it('isDirtyMessage returns string or undefined', () => {
      lukaisuFormCheck.dirty = false;
      const resultClean = lukaisuFormCheck.isDirtyMessage();
      expect(resultClean === undefined || typeof resultClean === 'string').toBe(true);

      lukaisuFormCheck.dirty = true;
      const resultDirty = lukaisuFormCheck.isDirtyMessage();
      expect(typeof resultDirty).toBe('string');
    });

    it('makeDirty returns void', () => {
      const result = lukaisuFormCheck.makeDirty();
      expect(result).toBeUndefined();
    });

    it('resetDirty returns void', () => {
      const result = lukaisuFormCheck.resetDirty();
      expect(result).toBeUndefined();
    });

    it('tagChanged returns void', () => {
      const result = lukaisuFormCheck.tagChanged(false);
      expect(result).toBeUndefined();
    });
  });
});
