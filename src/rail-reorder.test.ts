// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountRailReorder, readRailOrder, mergeRailOrder, moveRailItem, RAIL_ORDER_KEY } from "./rail-reorder";
import { mountUsageSlot } from "./usage-slot";
import { indicatorHost, watchRail } from "./rail-layout";

let owners: AbortController[];
let hit: Element | null;
const signal = () => { const owner = new AbortController(); owners.push(owner); return owner.signal; };
const item = (id: string) => document.querySelector<HTMLElement>(`[data-rail-reorder-item="${id}"]`)!;
const visualOrder = () => [...document.querySelectorAll<HTMLElement>("[data-rail-reorder-item]")]
  .sort((a, b) => Number(a.style.getPropertyValue("--rail-item-order")) - Number(b.style.getPropertyValue("--rail-item-order")))
  .map(node => node.getAttribute("data-rail-reorder-item"));
const rect = (top: number) => ({ x: 10, y: top, left: 10, right: 48, top, bottom: top + 30, width: 38, height: 30, toJSON: () => ({}) });
function pointer(type: string, target: EventTarget, y: number, x = 20, pointerType = "mouse") {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, button: 0, clientX: x, clientY: y });
  target.dispatchEvent(event);
  return event;
}
function drag(active: string, over: string, after = false) {
  const source = item(active);
  const target = item(over);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect(100));
  pointer("pointerdown", source, 300);
  hit = target;
  pointer("pointermove", window, after ? 125 : 105);
  pointer("pointerup", window, after ? 125 : 105);
}
beforeEach(() => {
  owners = [];
  hit = null;
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hit });
  localStorage.clear();
  document.body.innerHTML = `<div data-testid="app-nav-rail"><nav>
    <div data-sidebar-pro-rail-dock><div data-testid="nav-rail-header"><button>New thread</button></div>
      <div><button aria-label="Go back"></button><button aria-label="Go forward"></button></div></div>
    <div><button aria-label="Home"></button><span data-nav-rail-item="__bb__/search-threads"><button aria-label="Search threads"></button></span><button aria-label="More"></button></div>
    <button data-health-rail></button><div data-sidebar-pro-usage-slot data-sidebar-pro-usage-rail>
      <button class="meter" data-provider-id="codex"></button><button class="meter" data-provider-id="claude-code"></button><button class="meter" data-provider-id="acp-cursor"></button>
    </div><button data-thread-widget-toggle></button><button data-automation-provider-rail></button><button aria-label="Settings (Ctrl + ,)"></button>
  </nav></div>`;
});
afterEach(() => {
  owners.forEach(owner => owner.abort());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("rail order", () => {
  it("rejects malformed preferences and keeps hidden and newly installed icons", () => {
    localStorage.setItem(RAIL_ORDER_KEY, '[1,"home"]');
    expect(readRailOrder(localStorage)).toEqual([]);
    expect(mergeRailOrder(["settings", "home", "hidden"], ["home", "new", "settings"])).toEqual(["new", "settings", "home", "hidden"]);
    expect(moveRailItem(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
  });

  it("reorders across native shortcuts and custom controls without moving host DOM nodes", async () => {
    mountRailReorder(signal());
    const home = item("builtin:home");
    const parent = home.parentElement;
    drag("plugin:widget", "builtin:home");
    expect(visualOrder().indexOf("plugin:widget")).toBeLessThan(visualOrder().indexOf("builtin:home"));
    expect(home.parentElement).toBe(parent);
    const spacer = Number(document.querySelector<HTMLElement>("nav")!.style.getPropertyValue("--rail-spacer-order"));
    expect(spacer).toBeGreaterThan(Number(item("builtin:more").style.getPropertyValue("--rail-item-order")));
    expect(readRailOrder(localStorage)).toContain("plugin:widget");
    const writes: MutationRecord[] = [];
    const observer = new MutationObserver(records => writes.push(...records));
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    await vi.advanceTimersByTimeAsync(2000);
    observer.disconnect();
    expect(writes).toHaveLength(0);
  });

  it("persists individual usage icon order after remount", () => {
    mountRailReorder(signal());
    drag("usage:acp-cursor", "usage:codex");
    const expected = visualOrder();
    owners[0].abort();
    expect(document.querySelector("[data-rail-reorder-item]")).toBeNull();
    mountRailReorder(signal());
    expect(visualOrder()).toEqual(expected);
  });

  it("cancels with Escape and suppresses the click after a completed drag", () => {
    mountRailReorder(signal());
    const clicked = vi.fn();
    item("plugin:widget").addEventListener("click", clicked);
    const previous = visualOrder();
    hit = item("builtin:home");
    pointer("pointerdown", item("plugin:widget"), 300);
    pointer("pointermove", window, 100);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    pointer("pointerup", window, 100);
    expect(visualOrder()).toEqual(previous);
    expect(localStorage.getItem(RAIL_ORDER_KEY)).toBeNull();
    drag("plugin:widget", "builtin:home");
    item("plugin:widget").click();
    expect(clicked).not.toHaveBeenCalled();
  });

  it("keeps normal clicks and horizontal split drags available", () => {
    mountRailReorder(signal());
    const clicked = vi.fn();
    const node = item("plugin:widget");
    node.addEventListener("click", clicked);
    pointer("pointerdown", node, 100);
    pointer("pointerup", window, 100);
    node.click();
    expect(clicked).toHaveBeenCalledOnce();
    pointer("pointerdown", node, 100);
    expect(pointer("pointermove", window, 101, 100).defaultPrevented).toBe(false);
    expect(document.querySelector("[data-rail-drag-ghost]")).toBeNull();
    expect(localStorage.getItem(RAIL_ORDER_KEY)).toBeNull();
  });

  it("supports touch hold and keyboard moves, and disposes timers and styling", async () => {
    mountRailReorder(signal());
    pointer("pointerdown", item("plugin:widget"), 300, 20, "touch");
    await vi.advanceTimersByTimeAsync(350);
    expect(document.querySelector("[data-rail-drag-ghost]")).not.toBeNull();
    hit = item("builtin:home");
    vi.spyOn(hit, "getBoundingClientRect").mockReturnValue(rect(100));
    pointer("pointermove", window, 105, 20, "touch");
    pointer("pointerup", window, 105, 20, "touch");
    const before = visualOrder().indexOf("plugin:widget");
    item("plugin:widget").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
    expect(visualOrder().indexOf("plugin:widget")).toBe(before - 1);
    owners[0].abort();
    expect(document.querySelector("[data-rail-reorder-item], [data-rail-reorder-wrapper], [data-rail-drag-ghost]")).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps saved visual order when widget indicators leave and return", async () => {
    mountRailReorder(signal());
    mountUsageSlot(signal(), "sidebar-pro");
    const health = document.querySelector<HTMLElement>("[data-health-rail]")!;
    const nav = document.querySelector<HTMLElement>("nav")!;
    // Exercise the shared indicator contract without requiring sibling plugins.
    watchRail("test-health", signal(), () => {
      const host = indicatorHost(nav)!;
      if (health.parentElement !== host) host.append(health);
    });
    await vi.advanceTimersByTimeAsync(1000);
    drag("plugin:widget", "builtin:home");
    const expected = visualOrder();
    const header = document.createElement("div");
    header.setAttribute("data-thread-widget-indicators", "");
    document.body.append(header);
    await vi.advanceTimersByTimeAsync(1000);
    expect(header.querySelector("[data-health-rail]")?.hasAttribute("data-rail-reorder-item")).toBe(false);
    expect(header.querySelector(".meter")?.hasAttribute("data-rail-reorder-item")).toBe(false);
    header.removeAttribute("data-thread-widget-indicators");
    await vi.advanceTimersByTimeAsync(1000);
    expect(visualOrder()).toEqual(expected);
  });
});
