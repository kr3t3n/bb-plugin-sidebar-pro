import { mountLatest, watchRail } from "./rail-layout";

export const RAIL_ORDER_KEY = "bb.local.rail-order.v1";
const ITEM = "data-rail-reorder-item";
const SPACER = "builtin:rail-spacer";
const WRAPPER = "data-rail-reorder-wrapper";
const NAV = '[data-testid="app-nav-rail"] nav';
const STYLE_ID = "sidebar-pro-rail-reorder-style";
const SELECTORS = [
  '[data-testid="nav-rail-header"]', '[data-nav-rail-item]',
  '[data-health-rail]', '[data-sidebar-pro-usage-slot] .meter[data-provider-id]',
  '[data-thread-widget-toggle]', '[data-automation-provider-rail]',
  'button[aria-label="Home"]', 'button[aria-label="More"]',
  'button[aria-label^="Settings"]', 'button[aria-label="Go back"]', 'button[aria-label="Go forward"]',
].join(",");
const CSS = `
${NAV}[data-rail-reorder] { overflow-y: auto; scrollbar-width: none; padding-top: 8px; }
${NAV}[data-rail-reorder]::after {
  content: ""; order: var(--rail-spacer-order); flex: 1 0 0; min-height: 0; width: 100%;
}
${NAV} [${WRAPPER}] { display: contents !important; }
${NAV} [${ITEM}] {
  order: var(--rail-item-order); flex: 0 0 auto; touch-action: none; user-select: none;
}
${NAV} [data-rail-dragging] { opacity: .4; }
${NAV} [data-rail-drop="before"] { box-shadow: 0 -3px 0 var(--ring, #a3e635); }
${NAV} [data-rail-drop="after"] { box-shadow: 0 3px 0 var(--ring, #a3e635); }
[data-rail-drag-ghost] {
  position: fixed; z-index: 2147483000; pointer-events: none; max-width: 240px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px;
  color: var(--foreground); background: var(--popover, var(--background));
  box-shadow: 0 4px 16px #0003; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
}
`;
type Item = { id: string; node: HTMLElement; bottom: boolean };

export function readRailOrder(storage: Pick<Storage, "getItem">): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(RAIL_ORDER_KEY) ?? "[]");
    if (!Array.isArray(value) || value.length > 256 || value.some(id => typeof id !== "string" || id.length > 200)) return [];
    return [...new Set(value)] as string[];
  } catch { return []; }
}

/** Keep hidden items in place and insert new icons near their default neighbours. */
export function mergeRailOrder(saved: readonly string[], defaults: readonly string[]): string[] {
  const order = [...saved];
  defaults.forEach((id, index) => {
    if (order.includes(id)) return;
    const next = defaults.slice(index + 1).find(candidate => order.includes(candidate));
    order.splice(next === undefined ? order.length : order.indexOf(next), 0, id);
  });
  return order;
}

export function moveRailItem(order: readonly string[], active: string, over: string, after: boolean): string[] {
  if (active === over || !order.includes(active) || !order.includes(over)) return [...order];
  const next = order.filter(id => id !== active);
  next.splice(next.indexOf(over) + Number(after), 0, active);
  return next;
}

function identify(node: HTMLElement): Item | null {
  let id: string;
  let bottom = false;
  if (node.hasAttribute("data-nav-rail-item")) id = `panel:${node.getAttribute("data-nav-rail-item")}`;
  else if (node.dataset.testid === "nav-rail-header") id = "builtin:new-thread";
  else if (node.hasAttribute("data-health-rail")) { id = "plugin:health"; bottom = true; }
  else if (node.hasAttribute("data-thread-widget-toggle")) { id = "plugin:widget"; bottom = true; }
  else if (node.hasAttribute("data-automation-provider-rail")) { id = "plugin:automation"; bottom = true; }
  else if (node.matches(".meter[data-provider-id]")) { id = `usage:${node.dataset.providerId}`; bottom = true; }
  else {
    if (node.closest("[data-nav-rail-item]")) return null;
    const label = node.getAttribute("aria-label") ?? "";
    id = label.startsWith("Settings") ? "builtin:settings" : `builtin:${label.toLowerCase().replaceAll(" ", "-")}`;
    bottom = id === "builtin:settings";
  }
  return { id, node, bottom };
}

export function mountRailReorder(signal: AbortSignal): void {
  mountLatest("sidebar-pro-rail-reorder", signal, mount);
}

function mount(signal: AbortSignal): void {
  const doc = document;
  const win = window;
  let saved = readRailOrder(win.localStorage);
  let nav: HTMLElement | null = null;
  let items: Item[] = [];
  let marked = new Set<HTMLElement>();
  let wrappers = new Set<HTMLElement>();
  let suppressUntil = 0;
  let hold: number | null = null;
  let ghost: HTMLElement | null = null;
  let cue: HTMLElement | null = null;
  let drag: { id: string; node: HTMLElement; pointer: number; type: string; x: number; y: number; active: boolean; over: string | null; after: boolean } | null = null;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);

  const set = (el: HTMLElement, attr: string, value: string) => {
    if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
  };
  const property = (el: HTMLElement, key: string, value: string) => {
    if (el.style.getPropertyValue(key) !== value) el.style.setProperty(key, value);
  };
  const clearItem = (node: HTMLElement) => {
    node.removeAttribute(ITEM);
    node.removeAttribute("data-rail-dragging");
    node.removeAttribute("data-rail-drop");
    node.style.removeProperty("--rail-item-order");
  };
  const clearNav = (node: HTMLElement | null) => {
    node?.removeAttribute("data-rail-reorder");
    node?.style.removeProperty("--rail-spacer-order");
  };
  const finish = () => {
    if (hold !== null) win.clearTimeout(hold);
    hold = null;
    const previous = drag;
    drag = null;
    if (previous?.node.hasPointerCapture?.(previous.pointer)) previous.node.releasePointerCapture(previous.pointer);
    previous?.node.removeAttribute("data-rail-dragging");
    cue?.removeAttribute("data-rail-drop");
    cue = null;
    ghost?.remove();
    ghost = null;
    if (previous?.active) {
      suppressUntil = Date.now() + 350;
      // Release the host's pending drag-to-split listener without dropping a pane.
      win.dispatchEvent(new PointerEvent("pointercancel", { pointerId: previous.pointer, bubbles: true }));
    }
  };
  const defaults = () => [
    ...items.filter(item => !item.bottom).map(item => item.id),
    SPACER,
    ...items.filter(item => item.bottom).map(item => item.id),
  ];
  const sync = () => {
    const nextNav = doc.querySelector<HTMLElement>(NAV);
    if (nav !== nextNav) { finish(); clearNav(nav); nav = nextNav; }
    const nextItems = nav ? [...nav.querySelectorAll<HTMLElement>(SELECTORS)].map(identify).filter((item): item is Item => item !== null) : [];
    const nodes = new Set(nextItems.map(item => item.node));
    if (drag && !nodes.has(drag.node)) finish();
    for (const node of marked) if (!nodes.has(node)) clearItem(node);
    marked = nodes;
    items = nextItems;
    const nextWrappers = new Set<HTMLElement>(nav?.querySelectorAll<HTMLElement>(
      "[data-sidebar-pro-rail-dock], [data-sidebar-pro-history], [data-sidebar-pro-usage-slot]",
    ));
    for (const item of items) {
      let parent = item.node.parentElement;
      while (parent && parent !== nav) { nextWrappers.add(parent); parent = parent.parentElement; }
    }
    for (const node of wrappers) if (!nextWrappers.has(node)) node.removeAttribute(WRAPPER);
    wrappers = nextWrappers;
    if (!nav) return;
    set(nav, "data-rail-reorder", "");
    for (const node of wrappers) set(node, WRAPPER, "");
    const order = mergeRailOrder(saved, defaults()).filter(id => id === SPACER || items.some(item => item.id === id));
    for (const item of items) {
      set(item.node, ITEM, item.id);
      property(item.node, "--rail-item-order", String(order.indexOf(item.id) * 2));
    }
    // The spacer stays between sections while an icon can cross it on drop.
    property(nav, "--rail-spacer-order", String(order.indexOf(SPACER) * 2));
  };
  const commit = (active: string, over: string, after: boolean) => {
    const order = mergeRailOrder(saved, defaults());
    const next = moveRailItem(order, active, over, after);
    if (next.join("\0") === order.join("\0")) return;
    saved = next;
    try { win.localStorage.setItem(RAIL_ORDER_KEY, JSON.stringify(saved)); } catch { /* Keep this window's order if storage is unavailable. */ }
    sync();
  };
  const engage = () => {
    if (!drag || drag.active) return;
    // Dismiss a More/context menu that opened on pointer down.
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (!drag) return;
    drag.active = true;
    try { drag.node.setPointerCapture?.(drag.pointer); } catch { /* Synthetic events may have no active pointer. */ }
    drag.node.setAttribute("data-rail-dragging", "");
    ghost = doc.createElement("div");
    ghost.setAttribute("data-rail-drag-ghost", "");
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = drag.node.getAttribute("aria-label") ?? drag.node.querySelector("button")?.getAttribute("aria-label") ?? "New thread";
    doc.body.append(ghost);
    ghost.style.left = `${drag.x + 14}px`;
    ghost.style.top = `${drag.y + 12}px`;
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || !(event.target instanceof Element)) return;
    const node = event.target.closest<HTMLElement>(`[${ITEM}]`);
    if (!node || !nav?.contains(node)) return;
    finish();
    drag = { id: node.getAttribute(ITEM)!, node, pointer: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, active: false, over: null, after: false };
    if (event.pointerType === "touch") hold = win.setTimeout(engage, 350);
  };
  const onMove = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = Math.abs(event.clientX - drag.x);
    const dy = Math.abs(event.clientY - drag.y);
    if (!drag.active) {
      if (drag.type === "touch") { if (Math.max(dx, dy) > 10) finish(); return; }
      if (dx > 10 && dx > dy * 1.5) { finish(); return; }
      if (dy < 6 || dy < dx) return;
      engage();
    }
    if (!drag?.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (ghost) { ghost.style.left = `${event.clientX + 14}px`; ghost.style.top = `${event.clientY + 12}px`; }
    const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(`[${ITEM}]`);
    const valid = target && nav?.contains(target) && target !== drag.node ? target : null;
    if (cue && cue !== valid) cue.removeAttribute("data-rail-drop");
    cue = valid;
    drag.over = valid?.getAttribute(ITEM) ?? null;
    if (valid) {
      const rect = valid.getBoundingClientRect();
      drag.after = event.clientY >= rect.top + rect.height / 2;
      set(valid, "data-rail-drop", drag.after ? "after" : "before");
    }
    if (nav) {
      const r = nav.getBoundingClientRect();
      if (event.clientY < r.top + 30) nav.scrollTop -= 12;
      else if (event.clientY > r.bottom - 30) nav.scrollTop += 12;
    }
  };
  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const current = drag;
    if (current.active) { event.preventDefault(); event.stopImmediatePropagation(); }
    finish();
    if (current.active && current.over) commit(current.id, current.over, current.after);
  };
  const onCancel = () => finish();
  const onClick = (event: MouseEvent) => {
    if (Date.now() < suppressUntil && event.target instanceof Element && event.target.closest(NAV)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  const onContext = (event: MouseEvent) => {
    if (drag?.active && drag.type === "touch") { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && drag?.active) { event.preventDefault(); finish(); return; }
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key) || !(event.target instanceof Element)) return;
    const node = event.target.closest<HTMLElement>(`[${ITEM}]`);
    if (!node || !nav?.contains(node)) return;
    const visible = mergeRailOrder(saved, defaults()).filter(id => items.some(item => item.id === id));
    const id = node.getAttribute(ITEM)!;
    const index = visible.indexOf(id);
    const target = visible[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    commit(id, target, event.key === "ArrowDown");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== RAIL_ORDER_KEY) return;
    finish(); saved = readRailOrder(win.localStorage); sync();
  };
  // Native HTML dragging would compete with the pointer reorder operation.
  const onNativeDrag = (event: DragEvent) => {
    if (drag && event.target instanceof Element && event.target.closest(`[${ITEM}]`)) event.preventDefault();
  };
  doc.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", onMove, { capture: true, passive: false });
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onCancel, true);
  win.addEventListener("lostpointercapture", onCancel, true);
  win.addEventListener("blur", onCancel);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("contextmenu", onContext, true);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("dragstart", onNativeDrag, true);
  win.addEventListener("storage", onStorage);
  watchRail("rail-reorder", signal, sync);
  signal.addEventListener("abort", () => {
    finish();
    doc.removeEventListener("pointerdown", onDown, true);
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", onUp, true);
    win.removeEventListener("pointercancel", onCancel, true);
    win.removeEventListener("lostpointercapture", onCancel, true);
    win.removeEventListener("blur", onCancel);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("contextmenu", onContext, true);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("dragstart", onNativeDrag, true);
    win.removeEventListener("storage", onStorage);
    for (const node of marked) clearItem(node);
    for (const node of wrappers) node.removeAttribute(WRAPPER);
    clearNav(nav);
    style.remove();
  }, { once: true });
}
