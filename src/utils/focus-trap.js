const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export function getFocusableElements(container) {
  if (!(container instanceof HTMLElement)) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(isVisible);
}

export function trapFocusInModal(event, modalEl) {
  if (event.key !== 'Tab') return false;
  if (!(modalEl instanceof HTMLElement) || modalEl.hidden) return false;

  const focusable = getFocusableElements(modalEl);
  if (!focusable.length) return false;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeEl = document.activeElement;

  if (event.shiftKey) {
    if (activeEl === first || !modalEl.contains(activeEl)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    return false;
  }

  if (activeEl === last || !modalEl.contains(activeEl)) {
    event.preventDefault();
    first.focus();
    return true;
  }

  return false;
}

export function restoreFocus(targetEl) {
  if (!(targetEl instanceof HTMLElement)) return;
  if (!targetEl.isConnected) return;
  targetEl.focus();
}
