/**
 * Word Popup - Native dialog implementation for word interactions
 *
 * This module provides popup dialogs for word interactions,
 * using the native HTML <dialog> element.
 *
 * Note: For the new Bulma reading interface, prefer using the
 * word_modal Alpine.js component from reading/components/word_modal.ts,
 * which provides a Bulma modal with full reactivity.
 *
 * This module is retained for the legacy reading interface and test pages.
 *
 * @license unlicense
 */

// Popup configuration
const POPUP_CONFIG = {
  width: 280,
  fgColor: '#FFFFE8',
  closeText: 'Close',
  fontFamily: '"Lucida Grande", Arial, sans-serif, STHeiti, "Arial Unicode MS", MingLiu'
};

// Store the current popup element and positioning event
let dialogElement: HTMLDialogElement | null = null;
let titleElement: HTMLElement | null = null;
let contentElement: HTMLElement | null = null;
let currentEvent: Event | null = null;

/**
 * Initialize the popup dialog in the DOM
 */
function ensurePopupContainer(): HTMLDialogElement {
  if (dialogElement) {
    return dialogElement;
  }

  // Create the dialog element
  dialogElement = document.createElement('dialog');
  dialogElement.id = 'lukaisu-word-popup';
  dialogElement.className = 'lukaisu-popup-dialog';

  // Create titlebar
  const titlebar = document.createElement('div');
  titlebar.className = 'lukaisu-popup-titlebar';

  titleElement = document.createElement('span');
  titleElement.className = 'lukaisu-popup-title';
  titleElement.textContent = 'Word';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lukaisu-popup-close';
  closeBtn.textContent = '×';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', POPUP_CONFIG.closeText);
  closeBtn.addEventListener('click', () => closePopup());

  titlebar.appendChild(titleElement);
  titlebar.appendChild(closeBtn);

  // Create content area
  contentElement = document.createElement('div');
  contentElement.className = 'lukaisu-popup-content';

  dialogElement.appendChild(titlebar);
  dialogElement.appendChild(contentElement);
  document.body.appendChild(dialogElement);

  // Close on click outside (backdrop click)
  dialogElement.addEventListener('click', (e) => {
    if (e.target === dialogElement) {
      closePopup();
    }
  });

  // Close on Escape key (native dialog handles this, but we need to clean up state)
  dialogElement.addEventListener('close', () => {
    currentEvent = null;
  });

  return dialogElement;
}

/**
 * Position the dialog near the mouse event
 */
function positionDialog(dialog: HTMLDialogElement, event: MouseEvent | null): void {
  if (event) {
    // Position near the click with offset
    const offsetX = 10;
    const offsetY = 10;
    let x = event.clientX + offsetX;
    let y = event.clientY + offsetY;

    // Ensure dialog stays within viewport
    const dialogRect = dialog.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust if would overflow right edge
    if (x + POPUP_CONFIG.width > viewportWidth) {
      x = Math.max(10, viewportWidth - POPUP_CONFIG.width - 10);
    }

    // Adjust if would overflow bottom edge (estimate height)
    const estimatedHeight = dialogRect.height || 200;
    if (y + estimatedHeight > viewportHeight) {
      y = Math.max(10, event.clientY - estimatedHeight - offsetY);
    }

    dialog.style.position = 'fixed';
    dialog.style.left = `${x}px`;
    dialog.style.top = `${y}px`;
    dialog.style.margin = '0';
  } else {
    // Center in viewport
    dialog.style.position = 'fixed';
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.margin = '0';
  }
}

/**
 * Close any open popup
 */
export function closePopup(): void {
  if (dialogElement && dialogElement.open) {
    dialogElement.close();
    // Reset transform for next positioning
    dialogElement.style.transform = '';
  }
  currentEvent = null;
}

/**
 * Show a popup dialog with content and title
 *
 * @param content HTML content for the popup body
 * @param title Title for the popup header
 * @returns true for compatibility
 */
export function showPopup(content: string, title?: string): boolean {
  // Close any existing popup
  closePopup();

  const dialog = ensurePopupContainer();

  // Set title
  if (titleElement) {
    titleElement.textContent = title || 'Word';
  }

  // Set content
  if (contentElement) {
    contentElement.innerHTML = content;
  }

  // Show the dialog (non-modal so user can interact with page)
  dialog.show();

  // Position after showing so we can measure
  const mouseEvent = currentEvent instanceof MouseEvent ? currentEvent : null;
  positionDialog(dialog, mouseEvent);

  return true;
}

/**
 * Store the current event for positioning.
 * Call this before showing the popup to position it near the click.
 */
export function setCurrentEvent(event: Event): void {
  currentEvent = event;
}

/**
 * Get click handler that stores event before calling a function
 *
 * @param handler The actual click handler to call
 * @returns A wrapped handler that stores the event
 */
export function withEventPosition<T extends (...args: unknown[]) => unknown>(
  handler: T
): (event: Event, ...args: Parameters<T>) => ReturnType<T> {
  return function (event: Event, ...args: Parameters<T>): ReturnType<T> {
    setCurrentEvent(event);
    return handler(...args) as ReturnType<T>;
  };
}

// Add CSS styles for the popup
const styles = `
.lukaisu-popup-dialog {
  font-family: ${POPUP_CONFIG.fontFamily};
  font-size: 13px;
  width: ${POPUP_CONFIG.width}px;
  padding: 0;
  border: 1px solid #5050A0;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 20px);
  overflow: hidden;
}
.lukaisu-popup-dialog::backdrop {
  background: transparent;
}
.lukaisu-popup-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #5050A0;
  color: #FFFFFF;
  padding: 5px 10px;
  cursor: default;
}
.lukaisu-popup-title {
  font-weight: bold;
}
.lukaisu-popup-titlebar a {
  color: #FFFF00;
}
.lukaisu-popup-close {
  background: transparent;
  border: none;
  color: #FFFFFF;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  margin: -2px -4px -2px 8px;
}
.lukaisu-popup-close:hover {
  color: #FFFF00;
}
.lukaisu-popup-content {
  background: ${POPUP_CONFIG.fgColor};
  padding: 10px;
  overflow: auto;
  max-height: calc(100vh - 80px);
}
.lukaisu-popup-content a {
  color: #0000FF;
}
.lukaisu-popup-content a:hover {
  color: #FF0000;
}
#lukaisu-word-popup img {
  vertical-align: middle;
  cursor: pointer;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .lukaisu-popup-dialog {
    border-color: #3d3d8d;
  }
  .lukaisu-popup-titlebar {
    background: #3d3d8d;
  }
  .lukaisu-popup-content {
    background: #2d2d2d;
    color: #e0e0e0;
  }
  .lukaisu-popup-content a {
    color: #6699ff;
  }
  .lukaisu-popup-content a:hover {
    color: #ff6666;
  }
}
:root[data-theme="dark"] .lukaisu-popup-dialog {
  border-color: #3d3d8d;
}
:root[data-theme="dark"] .lukaisu-popup-titlebar {
  background: #3d3d8d;
}
:root[data-theme="dark"] .lukaisu-popup-content {
  background: #2d2d2d;
  color: #e0e0e0;
}
:root[data-theme="dark"] .lukaisu-popup-content a {
  color: #6699ff;
}
:root[data-theme="dark"] .lukaisu-popup-content a:hover {
  color: #ff6666;
}
`;

// Inject styles when module loads
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Listen for cross-frame popup close events
  document.addEventListener('lukaisu-close-popup', () => {
    closePopup();
  });
}


/**
 * Close popup in parent frame via custom event.
 * Use this from child frames instead of accessing window.parent.closePopup directly.
 */
export function closeParentPopup(): void {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.document.dispatchEvent(new CustomEvent('lukaisu-close-popup'));
    }
  } catch {
    // Parent access may be blocked by same-origin policy, ignore
  }
}
