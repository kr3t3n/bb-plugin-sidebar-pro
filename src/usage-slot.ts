import {
  emptyProviderLimits,
  providerLimitsResultSchema,
  type ProviderLimit,
} from "./provider-limits";
import { renderUsageMeters } from "./usage-meter";

export const USAGE_ROW_SELECTOR = '[data-testid="app-sidebar-top-reserve-row"]';
export const USAGE_SLOT_ATTR = "data-sidebar-pro-usage-slot";
export const USAGE_SLOT_EVENT = "sidebar-pro-usage-slot";

const STYLE_ID = "sidebar-pro-usage-slot-style";
const POLL_MS = 60_000;

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
  padding-left: calc(2.25rem + 1ch);
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

  const show = (providers: readonly ProviderLimit[]) => {
    if (signal.aborted) return;
    latest = [...providers];
    const slot = ensureUsageSlot(doc);
    if (slot) renderUsageMeters(slot, latest);
  };

  // The host rebuilds the row. Refill only an empty slot so our own writes
  // do not schedule another paint.
  const refill = () => {
    if (signal.aborted) return;
    const slot = ensureUsageSlot(doc);
    if (slot && slot.childElementCount === 0) renderUsageMeters(slot, latest);
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

  const onAbort = () => {
    if (timer !== null) window.clearTimeout(timer);
    window.clearInterval(poll);
    observer.disconnect();
    doc.getElementById(STYLE_ID)?.remove();
    doc.querySelector(`[${USAGE_SLOT_ATTR}]`)?.remove();
  };
  signal.addEventListener("abort", onAbort, { once: true });
}
