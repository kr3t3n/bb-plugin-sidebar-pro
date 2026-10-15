/** Shared rail contract, vendored identically in the four local plugins.
 * Symbol.for gives separately built bundles one coordinator per window.
 * Only this coordinator orders controls. Never observe the whole document.
 */
const KEY = Symbol.for("bb.local.rail-layout.v2");
const NAV = '[data-testid="app-nav-rail"] nav';
const CONTROLS = [
  "[data-health-rail]",
  "[data-sidebar-pro-usage-slot]",
  "[data-thread-widget-toggle]",
  "[data-automation-provider-rail]",
];
type State = {
  clients: Map<string, () => void>;
  mounts: Map<string, AbortController>;
  observer: MutationObserver | null;
  nav: HTMLElement | null;
  timer: number | null;
  frame: number | null;
  running: boolean;
};
function state(): State {
  const host = window as unknown as Record<symbol, State>;
  return host[KEY] ??= {
    clients: new Map(), mounts: new Map(), observer: null, nav: null,
    timer: null, frame: null, running: false,
  };
}

/** Usage and health have one live location, including in compact widget mode. */
export function indicatorHost(fallback: HTMLElement | null): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-thread-widget-indicators]") ?? fallback;
}

function orderIndicators(host: HTMLElement): void {
  let anchor: HTMLElement | null = null;
  for (const selector of CONTROLS.slice(0, 2).reverse()) {
    const node = host.querySelector<HTMLElement>(`:scope > ${selector}`);
    if (node === null) continue;
    if (node.nextElementSibling !== anchor) host.insertBefore(node, anchor);
    anchor = node;
  }
}

/** Reconcile immediately when a widget header mounts or unmounts. */
export function refreshRail(): void { refresh(state()); }

/** Idempotent order, including absent controls and wrapped Settings. */
export function orderRail(nav: HTMLElement): boolean {
  let anchor = nav.querySelector<HTMLElement>('button[aria-label^="Settings"]');
  while (anchor !== null && anchor.parentElement !== nav) anchor = anchor.parentElement;
  let changed = false;
  for (const selector of [...CONTROLS].reverse()) {
    const node = nav.querySelector<HTMLElement>(`:scope > ${selector}`);
    if (node === null) continue;
    if (node.nextElementSibling !== anchor || node.parentElement !== nav) {
      nav.insertBefore(node, anchor);
      changed = true;
    }
    anchor = node;
  }
  return changed;
}

function refresh(s: State): void {
  if (s.running || s.clients.size === 0) return;
  s.running = true;
  s.observer?.disconnect();
  try {
    for (const callback of s.clients.values()) callback();
    s.nav = document.querySelector<HTMLElement>(NAV);
    if (s.nav !== null) orderRail(s.nav);
    const indicators = document.querySelector<HTMLElement>("[data-thread-widget-indicators]");
    if (indicators !== null) orderIndicators(indicators);
  } finally {
    s.running = false;
    if (s.clients.size > 0 && s.nav !== null) {
      // Direct children only; own writes happen while disconnected.
      s.observer?.observe(s.nav, { childList: true });
    }
  }
}

/** Rail replacement discovery is bounded to two checks per second. */
export function watchRail(id: string, signal: AbortSignal, callback: () => void): void {
  if (signal.aborted) return;
  const s = state();
  s.clients.set(id, callback);
  if (s.observer === null) {
    s.observer = new MutationObserver(() => {
      if (s.frame !== null) return;
      s.frame = window.requestAnimationFrame(() => {
        s.frame = null;
        refresh(s);
      });
    });
    s.timer = window.setInterval(() => refresh(s), 500);
  }
  signal.addEventListener("abort", () => {
    // An old generation must not remove a newer registration.
    if (s.clients.get(id) !== callback) return;
    s.clients.delete(id);
    if (s.clients.size !== 0) { refresh(s); return; }
    s.observer?.disconnect();
    s.observer = null;
    s.nav = null;
    if (s.timer !== null) window.clearInterval(s.timer);
    if (s.frame !== null) window.cancelAnimationFrame(s.frame);
    s.timer = s.frame = null;
  }, { once: true });
  refresh(s);
}

/** Replace the entire old mount, including its listeners and timers. */
export function mountLatest(id: string, signal: AbortSignal, mount: (signal: AbortSignal) => void): void {
  if (signal.aborted) return;
  const s = state();
  s.mounts.get(id)?.abort();
  const owner = new AbortController();
  s.mounts.set(id, owner);
  const dispose = () => owner.abort();
  signal.addEventListener("abort", dispose, { once: true });
  owner.signal.addEventListener("abort", () => {
    signal.removeEventListener("abort", dispose);
    if (s.mounts.get(id) === owner) s.mounts.delete(id);
  }, { once: true });
  try { mount(owner.signal); }
  catch (error) { owner.abort(); throw error; }
}
