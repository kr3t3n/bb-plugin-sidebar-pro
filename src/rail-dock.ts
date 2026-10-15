/**
 * bb 0.46 draws a vertical nav rail beside the thread list. The New thread
 * button and the back/forward arrows stay in the row above the list. This
 * module moves that chrome into the rail.
 */

export const RAIL_SELECTOR = '[data-testid="app-nav-rail"]';
export const RAIL_DOCK_ATTR = "data-sidebar-pro-rail-dock";
export const NEW_THREAD_HEADER_SELECTOR = '[data-testid="nav-rail-header"]';
export const TOP_ROW_SELECTOR = '[data-testid="app-sidebar-top-reserve-row"]';
export const TOP_ROW_COLLAPSED_ATTR = "data-sidebar-pro-rail-collapsed";
export const HISTORY_CLUSTER_ATTR = "data-sidebar-pro-history";
export const HISTORY_BACK_SELECTOR = '[aria-label="Go back"]';
export const HISTORY_FORWARD_SELECTOR = '[aria-label="Go forward"]';
/** Rail Settings button. The label includes the shortcut when one is set. */
export const SETTINGS_BUTTON_SELECTOR = 'button[aria-label^="Settings"]';

const STYLE_ID = "sidebar-pro-rail-dock-style";

const DOCK_CSS = `
[${RAIL_DOCK_ATTR}] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  flex: 0 0 auto;
  padding: 12px 0 8px;
  border-bottom: 1px solid var(--border);
}
[${RAIL_DOCK_ATTR}] ${NEW_THREAD_HEADER_SELECTOR} {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 0;
  height: auto;
}
[${RAIL_DOCK_ATTR}] ${NEW_THREAD_HEADER_SELECTOR} button {
  width: var(--bb-sidebar-control-size, 2rem);
  height: var(--bb-sidebar-control-size, 2rem);
  min-width: 0;
  flex: 0 0 auto;
  justify-content: center;
  padding: 0;
}
[${RAIL_DOCK_ATTR}] ${NEW_THREAD_HEADER_SELECTOR} button > span:not([data-icon-root]) {
  display: none;
}
[${RAIL_DOCK_ATTR}] [${HISTORY_CLUSTER_ATTR}] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  position: static;
}
[${RAIL_DOCK_ATTR}] [data-sidebar-history-shortcut-hints] {
  display: none;
}
${TOP_ROW_SELECTOR}[${TOP_ROW_COLLAPSED_ATTR}] {
  display: none;
}
`;

function ownerDocument(root: ParentNode): Document {
  return root instanceof Document ? root : document;
}

/** Direct nav child that wraps the Settings button, so usage can sit above it. */
export function settingsAnchor(nav: HTMLElement): HTMLElement | null {
  const button = nav.querySelector<HTMLElement>(SETTINGS_BUTTON_SELECTOR);
  if (button === null) return null;
  let node: HTMLElement | null = button;
  while (node !== null && node.parentElement !== nav) node = node.parentElement;
  return node;
}

/** Smallest element that holds both history buttons. */
export function historyCluster(root: ParentNode = document): HTMLElement | null {
  const back = root.querySelector<HTMLElement>(HISTORY_BACK_SELECTOR);
  const forward = root.querySelector<HTMLElement>(HISTORY_FORWARD_SELECTOR);
  if (back === null || forward === null) return null;
  let node: HTMLElement | null = back.parentElement;
  while (node !== null && !node.contains(forward)) node = node.parentElement;
  return node;
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DOCK_CSS;
  doc.head.appendChild(style);
}

/**
 * Park New thread and the history arrows at the top of the nav rail.
 * Returns the dock, or null when this bb build has no rail.
 */
export function syncRailChrome(root: ParentNode = document): HTMLElement | null {
  const rail = root.querySelector<HTMLElement>(RAIL_SELECTOR);
  const row = root.querySelector<HTMLElement>(TOP_ROW_SELECTOR);
  if (rail === null) {
    row?.removeAttribute(TOP_ROW_COLLAPSED_ATTR);
    return null;
  }

  const nav = rail.querySelector("nav");
  if (nav === null) return null;

  ensureStyle(ownerDocument(root));
  const doc = ownerDocument(root);
  let dock = nav.querySelector<HTMLElement>(`[${RAIL_DOCK_ATTR}]`);
  if (dock === null) {
    dock = doc.createElement("div");
    dock.setAttribute(RAIL_DOCK_ATTR, "");
  }
  if (nav.firstElementChild !== dock) nav.insertBefore(dock, nav.firstChild);

  const header = root.querySelector<HTMLElement>(NEW_THREAD_HEADER_SELECTOR);
  if (header !== null && dock.firstElementChild !== header) dock.prepend(header);

  const history = historyCluster(root);
  if (history !== null) {
    if (!history.hasAttribute(HISTORY_CLUSTER_ATTR)) history.setAttribute(HISTORY_CLUSTER_ATTR, "");
    if (history.parentElement !== dock) dock.append(history);
  }

  if (row !== null && header !== null && dock.contains(header)) {
    if (!row.hasAttribute(TOP_ROW_COLLAPSED_ATTR)) row.setAttribute(TOP_ROW_COLLAPSED_ATTR, "");
  }
  return dock;
}

/** Put the moved controls back and drop the dock. Used when the script unloads. */
export function releaseRailDock(root: ParentNode = document): void {
  const doc = ownerDocument(root);
  const row = doc.querySelector<HTMLElement>(TOP_ROW_SELECTOR);
  const header = doc.querySelector<HTMLElement>(NEW_THREAD_HEADER_SELECTOR);
  const history = doc.querySelector<HTMLElement>(`[${HISTORY_CLUSTER_ATTR}]`);
  if (row !== null) {
    if (header !== null) row.insertBefore(header, row.firstChild);
    if (history !== null && history.parentElement !== row) row.append(history);
    row.removeAttribute(TOP_ROW_COLLAPSED_ATTR);
  }
  doc.querySelector(`[${RAIL_DOCK_ATTR}]`)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
}
