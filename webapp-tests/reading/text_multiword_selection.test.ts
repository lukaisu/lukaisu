/**
 * Tests for multi-word selection module.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  handleTextSelection,
  setupMultiWordSelection
} from '../../webapp/js/modules/text/pages/reading/text_multiword_selection';

describe('text_multiword_selection.ts', () => {
  // The reader hands each completed selection to this callback (its runes
  // multi-word store); the module no longer touches Alpine.
  const onMultiWord = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/text/read',
        search: '?start=1'
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleTextSelection', () => {
    it('does nothing when selection is empty', () => {
      document.body.innerHTML = `
        <div id="thetext">
          <span id="sent_1">
            <span class="wsty" data_order="1">Hello</span>
            <span class="wsty" data_order="2">World</span>
          </span>
        </div>
      `;
      const container = document.getElementById('thetext')!;

      // Mock empty selection
      const mockSelection = {
        isCollapsed: true,
        rangeCount: 0,
        getRangeAt: vi.fn(),
        removeAllRanges: vi.fn()
      };
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

      handleTextSelection(container, onMultiWord);

      expect(onMultiWord).not.toHaveBeenCalled();
    });

    it('does nothing when only one word is selected', () => {
      document.body.innerHTML = `
        <div id="thetext">
          <span id="sent_1">
            <span class="wsty" data_order="1">Hello</span>
            <span class="wsty" data_order="2">World</span>
          </span>
        </div>
      `;
      const container = document.getElementById('thetext')!;
      const word1 = container.querySelector('[data_order="1"]')!;

      // Create a mock range that only contains one word
      const mockRange = {
        intersectsNode: (node: Node) => node === word1
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: vi.fn().mockReturnValue(mockRange),
        removeAllRanges: vi.fn()
      };
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

      handleTextSelection(container, onMultiWord);

      expect(onMultiWord).not.toHaveBeenCalled();
    });

    it('invokes the callback when multiple words are selected', () => {
      // In the real database, words are stored consecutively without space elements
      // The getSelectedText function adds spaces between consecutive word elements
      document.body.innerHTML = `
        <div id="thetext">
          <span id="sent_1">
            <span id="ID-1-1" class="wsty word" data_order="1">Hello</span>
            <span id="ID-2-1" class="wsty word" data_order="2">World</span>
          </span>
        </div>
      `;
      const container = document.getElementById('thetext')!;
      const word1 = container.querySelector('[data_order="1"]')!;
      const word2 = container.querySelector('[data_order="2"]')!;

      // Create a mock range that contains both words
      const mockRange = {
        intersectsNode: (node: Node) => node === word1 || node === word2
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: vi.fn().mockReturnValue(mockRange),
        removeAllRanges: vi.fn()
      };
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

      handleTextSelection(container, onMultiWord);

      expect(onMultiWord).toHaveBeenCalledWith(
        1, // textId from URL
        1, // position (first word's data_order)
        'Hello World', // text extracted with space added between consecutive words
        2 // word count
      );
    });

    it('shows alert when selected text is too long', () => {
      // Words are stored consecutively without space elements
      document.body.innerHTML = `
        <div id="thetext">
          <span id="sent_1">
            <span id="ID-1-1" class="wsty" data_order="1">${'A'.repeat(200)}</span>
            <span id="ID-2-1" class="wsty" data_order="2">${'B'.repeat(100)}</span>
          </span>
        </div>
      `;
      const container = document.getElementById('thetext')!;
      const word1 = container.querySelector('[data_order="1"]')!;
      const word2 = container.querySelector('[data_order="2"]')!;

      const mockRange = {
        intersectsNode: (node: Node) => node === word1 || node === word2
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: vi.fn().mockReturnValue(mockRange),
        removeAllRanges: vi.fn()
      };
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      handleTextSelection(container, onMultiWord);

      expect(alertSpy).toHaveBeenCalledWith('Selected text is too long!!!');
      expect(onMultiWord).not.toHaveBeenCalled();
    });
  });

  describe('setupMultiWordSelection', () => {
    it('attaches mouseup event listener to container', () => {
      document.body.innerHTML = '<div id="thetext"></div>';
      const container = document.getElementById('thetext')!;
      const addEventListenerSpy = vi.spyOn(container, 'addEventListener');

      setupMultiWordSelection(container, onMultiWord);

      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });
  });

  describe('getTextIdFromUrl', () => {
    it('extracts text ID from query parameter', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/text/read',
          search: '?start=42'
        },
        writable: true
      });

      // Words are stored consecutively without space elements
      document.body.innerHTML = `
        <div id="thetext">
          <span id="sent_1">
            <span id="ID-1-1" class="wsty" data_order="1">Hello</span>
            <span id="ID-2-1" class="wsty" data_order="2">World</span>
          </span>
        </div>
      `;
      const container = document.getElementById('thetext')!;
      const word1 = container.querySelector('[data_order="1"]')!;
      const word2 = container.querySelector('[data_order="2"]')!;

      const mockRange = {
        intersectsNode: (node: Node) => node === word1 || node === word2
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: vi.fn().mockReturnValue(mockRange),
        removeAllRanges: vi.fn()
      };
      vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

      handleTextSelection(container, onMultiWord);

      expect(onMultiWord).toHaveBeenCalledWith(
        42, // textId extracted from URL
        1,
        'Hello World',
        2
      );
    });
  });
});
