export const NEW_THREAD_ITEM_SELECTOR =
  '[data-sidebar-navigation-item="__bb__/new-thread"]';
export const SEARCH_SLOT_ATTR = "data-sidebar-pro-search-slot";
export const SEARCH_OPEN_ATTR = "data-sidebar-pro-search-open";

const STYLE_ID = "sidebar-pro-search-slot-style";

const SLOT_CSS = `
${NEW_THREAD_ITEM_SELECTOR} {
  display: flex !important;
  align-items: center;
  gap: 0.125rem;
  min-width: 0;
}
${NEW_THREAD_ITEM_SELECTOR} > button[aria-label^="New thread"] {
  flex: 1 1 auto;
  width: auto !important;
  min-width: 0;
}
${NEW_THREAD_ITEM_SELECTOR}[${SEARCH_OPEN_ATTR}="true"] > button[aria-label^="New thread"] {
  display: none;
}
[${SEARCH_SLOT_ATTR}] {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
}
${NEW_THREAD_ITEM_SELECTOR}[${SEARCH_OPEN_ATTR}="true"] [${SEARCH_SLOT_ATTR}] {
  flex: 1 1 auto;
}
`;

export function ensureSearchSlot(root: ParentNode = document): HTMLElement | null {
  const item = root.querySelector<HTMLElement>(NEW_THREAD_ITEM_SELECTOR);
  if (item === null) return null;

  let slot = item.querySelector<HTMLElement>(`[${SEARCH_SLOT_ATTR}]`);
  if (slot === null) {
    slot =
      root instanceof Document
        ? root.querySelector<HTMLElement>(`[${SEARCH_SLOT_ATTR}]`)
        : null;
  }
  if (slot === null) {
    slot = (root instanceof Document ? root : document).createElement("div");
    slot.setAttribute(SEARCH_SLOT_ATTR, "");
  }
  if (slot.parentElement !== item) item.appendChild(slot);
  return slot;
}

export function setNewThreadSearchOpen(
  open: boolean,
  root: ParentNode = document,
): void {
  const item = root.querySelector<HTMLElement>(NEW_THREAD_ITEM_SELECTOR);
  if (item === null) return;
  if (open) item.setAttribute(SEARCH_OPEN_ATTR, "true");
  else item.removeAttribute(SEARCH_OPEN_ATTR);
}

export function mountSearchSlot(signal: AbortSignal): void {
  const doc = document;
  if (doc.getElementById(STYLE_ID) === null) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = SLOT_CSS;
    doc.head.appendChild(style);
  }

  let timer: number | null = null;
  const run = () => {
    if (signal.aborted) return;
    ensureSearchSlot(doc);
  };
  const schedule = () => {
    if (signal.aborted) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      run();
    }, 50);
  };

  run();
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  const onAbort = () => {
    if (timer !== null) window.clearTimeout(timer);
    observer.disconnect();
    doc.getElementById(STYLE_ID)?.remove();
    doc.querySelector(`[${SEARCH_SLOT_ATTR}]`)?.remove();
  };
  signal.addEventListener("abort", onAbort, { once: true });
}
