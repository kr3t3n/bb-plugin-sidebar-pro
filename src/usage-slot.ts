import {
  emptyProviderLimits,
  providerLimitsResultSchema,
  type ProviderLimit,
} from "./provider-limits";
import { renderUsageCard, renderUsageMeters } from "./usage-meter";

export const USAGE_ROW_SELECTOR = '[data-testid="app-sidebar-top-reserve-row"]';
export const USAGE_SLOT_ATTR = "data-sidebar-pro-usage-slot";
export const USAGE_SLOT_EVENT = "sidebar-pro-usage-slot";

export const USAGE_CARD_ID = "sidebar-pro-usage-card";
/** The settings page of the built-in Provider usage plugin. */
export const USAGE_SCREEN_PATH = "/settings/plugins/provider-usage";

const STYLE_ID = "sidebar-pro-usage-slot-style";
const CARD_GAP_PX = 6;
const CARD_EDGE_PX = 8;
const POLL_MS = 60_000;
const USAGE_PAD_VAR = "--sidebar-pro-usage-pad";
const USAGE_PAD_FALLBACK = "calc(2.25rem + 1ch)";
const USAGE_PAD_GAP_PX = 8;

/** bb's sidebar toggle. The macOS app shifts it to clear the traffic lights. */
export const SIDEBAR_TOGGLE_SELECTOR = '[aria-label^="Toggle sidebar"]';

/**
 * The host row is `justify-end` and holds only the back and forward buttons.
 * Do not set min-width:0 or overflow:hidden here. That pair collapses the
 * slot to nothing and clips the figures.
 */
const SLOT_CSS = `
[${USAGE_SLOT_ATTR}] {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 8px;
  min-width: max-content;
  max-width: calc(100% - 4.75rem);
  margin-right: auto;
  padding-left: var(${USAGE_PAD_VAR}, ${USAGE_PAD_FALLBACK});
  color: var(--foreground);
  font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
[${USAGE_SLOT_ATTR}] .meter {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  margin: 0 -3px;
  padding: 2px 3px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
[${USAGE_SLOT_ATTR}] .meter:hover,
[${USAGE_SLOT_ATTR}] .meter:focus-visible {
  background: color-mix(in srgb, currentColor 10%, transparent);
  outline: none;
}
[${USAGE_SLOT_ATTR}] svg {
  width: 13px;
  height: 13px;
  display: block;
  flex: 0 0 auto;
}
[${USAGE_SLOT_ATTR}] .pcts {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
[${USAGE_SLOT_ATTR}] .pct-ok { color: light-dark(#047857, #86efac); }
[${USAGE_SLOT_ATTR}] .pct-low { color: light-dark(#b45309, #fbbf24); }
[${USAGE_SLOT_ATTR}] .pct-critical { color: light-dark(#dc2626, #fca5a5); }
[${USAGE_SLOT_ATTR}] .pct-unknown { color: var(--muted-foreground); }

#${USAGE_CARD_ID} {
  position: fixed;
  z-index: 2147483000;
  width: 260px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--popover, var(--background));
  color: var(--popover-foreground, var(--foreground));
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  font: 400 12px/1.35 ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
#${USAGE_CARD_ID}[hidden] { display: none; }
#${USAGE_CARD_ID} .card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
#${USAGE_CARD_ID} .card-head svg { width: 14px; height: 14px; flex: 0 0 auto; }
#${USAGE_CARD_ID} .card-title { font-weight: 600; }
#${USAGE_CARD_ID} .card-plan {
  margin-left: auto;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${USAGE_CARD_ID} .card-row + .card-row { margin-top: 8px; }
#${USAGE_CARD_ID} .card-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}
#${USAGE_CARD_ID} .card-bar {
  height: 4px;
  margin: 4px 0 3px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
#${USAGE_CARD_ID} .card-fill { display: block; height: 100%; border-radius: 999px; }
#${USAGE_CARD_ID} .card-detail,
#${USAGE_CARD_ID} .card-empty,
#${USAGE_CARD_ID} .card-hint { color: var(--muted-foreground); }
#${USAGE_CARD_ID} .card-hint {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
#${USAGE_CARD_ID} .pct-ok { color: light-dark(#047857, #86efac); }
#${USAGE_CARD_ID} .pct-low { color: light-dark(#b45309, #fbbf24); }
#${USAGE_CARD_ID} .pct-critical { color: light-dark(#dc2626, #fca5a5); }
#${USAGE_CARD_ID} .pct-unknown { color: var(--muted-foreground); }
#${USAGE_CARD_ID} .fill-ok { background: light-dark(#047857, #86efac); }
#${USAGE_CARD_ID} .fill-low { background: light-dark(#b45309, #fbbf24); }
#${USAGE_CARD_ID} .fill-critical { background: light-dark(#dc2626, #fca5a5); }
#${USAGE_CARD_ID} .fill-unknown { background: var(--muted-foreground); }
`;

export function ensureUsageSlot(root: ParentNode = document): HTMLElement | null {
  const row = root.querySelector<HTMLElement>(USAGE_ROW_SELECTOR);
  if (row === null) return null;

  const doc = root instanceof Document ? root : document;
  let slot = doc.querySelector<HTMLElement>(`[${USAGE_SLOT_ATTR}]`);
  let changed = false;
  if (slot === null) {
    slot = doc.createElement("div");
    slot.setAttribute(USAGE_SLOT_ATTR, "");
    changed = true;
  }
  if (slot.parentElement !== row || row.firstElementChild !== slot) {
    row.insertBefore(slot, row.firstChild);
    changed = true;
  }
  if (changed) doc.dispatchEvent(new CustomEvent(USAGE_SLOT_EVENT));
  return slot;
}

/**
 * How far the figures must start so they clear the sidebar toggle.
 * Returns null when the toggle is absent or does not cross this slot.
 */
export function sidebarToggleClearancePx(
  slot: HTMLElement,
  root: ParentNode = document,
): number | null {
  const slotRect = slot.getBoundingClientRect();
  let clearance = 0;
  let hit = false;
  for (const button of root.querySelectorAll<HTMLElement>(SIDEBAR_TOGGLE_SELECTOR)) {
    const buttonRect = button.getBoundingClientRect();
    if (buttonRect.width <= 0 || buttonRect.height <= 0) continue;
    const overlapsY = buttonRect.bottom > slotRect.top && buttonRect.top < slotRect.bottom;
    if (!overlapsY) continue;
    const overlap = buttonRect.right - slotRect.left + USAGE_PAD_GAP_PX;
    if (overlap > 0) {
      hit = true;
      clearance = Math.max(clearance, overlap);
    }
  }
  return hit ? Math.ceil(clearance) : null;
}

/** Keep the browser padding, and grow it when the toggle sits further right. */
export function syncUsageSlotPadding(slot: HTMLElement, root: ParentNode = document): void {
  const clearance = sidebarToggleClearancePx(slot, root);
  if (clearance === null) {
    slot.style.removeProperty(USAGE_PAD_VAR);
    return;
  }
  slot.style.setProperty(USAGE_PAD_VAR, `max(${USAGE_PAD_FALLBACK}, ${clearance}px)`);
}

/**
 * Open the Provider usage settings page. bb routes with the browser history
 * API, so push the path and let the router read it from a popstate event.
 */
export function openUsageScreen(win: Window = window): void {
  if (win.location.pathname === USAGE_SCREEN_PATH) return;
  const previous = win.history.state as { idx?: unknown } | null;
  const idx = typeof previous?.idx === "number" ? previous.idx + 1 : 0;
  const key = Math.random().toString(36).slice(2, 10);
  win.history.pushState({ usr: null, key, idx }, "", USAGE_SCREEN_PATH);
  win.dispatchEvent(new PopStateEvent("popstate", { state: win.history.state }));
}

/** Place the card below the meter and keep it inside the window. */
export function placeUsageCard(card: HTMLElement, anchor: HTMLElement, win: Window = window): void {
  const anchorRect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const maxLeft = Math.max(CARD_EDGE_PX, win.innerWidth - cardRect.width - CARD_EDGE_PX);
  const left = Math.min(Math.max(CARD_EDGE_PX, anchorRect.left), maxLeft);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(anchorRect.bottom + CARD_GAP_PX)}px`;
}

function meterFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[${USAGE_SLOT_ATTR}] .meter`);
}

export async function fetchProviderLimits(
  pluginId: string,
  signal?: AbortSignal,
): Promise<ProviderLimit[] | null> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/providerLimits`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal,
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { ok?: boolean; result?: unknown };
  if (data.ok !== true) return null;
  const parsed = providerLimitsResultSchema.safeParse(data.result);
  return parsed.success ? parsed.data.providers : null;
}

export function mountUsageSlot(signal: AbortSignal, pluginId: string): void {
  const doc = document;
  if (doc.getElementById(STYLE_ID) === null) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = SLOT_CSS;
    doc.head.appendChild(style);
  }

  let latest = emptyProviderLimits();
  let timer: number | null = null;
  let hovered: HTMLElement | null = null;

  const card = doc.createElement("div");
  card.id = USAGE_CARD_ID;
  card.setAttribute("role", "tooltip");
  card.hidden = true;
  doc.body.appendChild(card);

  const showCard = (meter: HTMLElement) => {
    const provider = latest.find((row) => row.providerId === meter.dataset.providerId);
    if (provider === undefined) return;
    hovered = meter;
    renderUsageCard(card, provider);
    card.hidden = false;
    placeUsageCard(card, meter);
  };

  const hideCard = () => {
    hovered = null;
    card.hidden = true;
  };

  const onOver = (event: Event) => {
    const meter = meterFromEvent(event);
    if (meter !== null && meter !== hovered) showCard(meter);
  };

  const onOut = (event: Event) => {
    const meter = meterFromEvent(event);
    if (meter === null) return;
    const next = (event as FocusEvent | PointerEvent).relatedTarget;
    if (next instanceof Node && meter.contains(next)) return;
    hideCard();
  };

  const onClick = (event: Event) => {
    if (meterFromEvent(event) === null) return;
    event.preventDefault();
    hideCard();
    openUsageScreen();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") hideCard();
  };

  doc.addEventListener("pointerover", onOver);
  doc.addEventListener("pointerout", onOut);
  doc.addEventListener("focusin", onOver);
  doc.addEventListener("focusout", onOut);
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKey);

  const show = (providers: readonly ProviderLimit[]) => {
    if (signal.aborted) return;
    latest = [...providers];
    const slot = ensureUsageSlot(doc);
    if (slot) {
      const hoveredId = hovered?.dataset.providerId;
      renderUsageMeters(slot, latest);
      syncUsageSlotPadding(slot);
      // The meters were rebuilt. Keep an open card on the new element.
      const meter = hoveredId
        ? slot.querySelector<HTMLElement>(`.meter[data-provider-id="${hoveredId}"]`)
        : null;
      if (meter) showCard(meter);
      else hideCard();
    }
  };

  // The host rebuilds the row. Refill only an empty slot so our own writes
  // do not schedule another paint.
  const refill = () => {
    if (signal.aborted) return;
    const slot = ensureUsageSlot(doc);
    if (slot === null) return;
    if (slot.childElementCount === 0) renderUsageMeters(slot, latest);
    if (hovered !== null && !hovered.isConnected) hideCard();
    syncUsageSlotPadding(slot);
  };

  const refresh = () => {
    if (signal.aborted) return;
    void fetchProviderLimits(pluginId, signal)
      .then((providers) => {
        if (signal.aborted || providers === null) return;
        show(providers);
      })
      .catch(() => {
        // Keep the last figures. A failed poll must not clear the row.
      });
  };

  show(latest);
  refresh();
  const poll = window.setInterval(refresh, POLL_MS);

  const schedule = () => {
    if (signal.aborted) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      refill();
    }, 50);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", refill);
  const frame = window.requestAnimationFrame(refill);

  const onAbort = () => {
    if (timer !== null) window.clearTimeout(timer);
    window.clearInterval(poll);
    window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", refill);
    doc.removeEventListener("pointerover", onOver);
    doc.removeEventListener("pointerout", onOut);
    doc.removeEventListener("focusin", onOver);
    doc.removeEventListener("focusout", onOut);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("keydown", onKey);
    observer.disconnect();
    card.remove();
    doc.getElementById(STYLE_ID)?.remove();
    doc.querySelector(`[${USAGE_SLOT_ATTR}]`)?.remove();
  };
  signal.addEventListener("abort", onAbort, { once: true });
}
