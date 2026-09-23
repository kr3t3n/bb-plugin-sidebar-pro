// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_TOGGLE_SELECTOR,
  USAGE_SLOT_ATTR,
  ensureUsageSlot,
  sidebarToggleClearancePx,
  syncUsageSlotPadding,
} from "./usage-slot";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ensureUsageSlot", () => {
  it("inserts the slot before the back and forward controls", () => {
    document.body.innerHTML = `
      <div data-testid="app-sidebar-top-reserve-row">
        <div>
          <button type="button" aria-label="Go back"></button>
          <button type="button" aria-label="Go forward"></button>
        </div>
      </div>
    `;
    const slot = ensureUsageSlot(document);
    const row = document.querySelector('[data-testid="app-sidebar-top-reserve-row"]');
    expect(slot).not.toBeNull();
    expect(row?.firstElementChild).toBe(slot);
    expect(slot?.getAttribute(USAGE_SLOT_ATTR)).toBe("");
    expect(ensureUsageSlot(document)).toBe(slot);
  });

  it("returns null when the top row is missing", () => {
    document.body.innerHTML = `<button type="button" aria-label="Go back"></button>`;
    expect(ensureUsageSlot(document)).toBeNull();
  });
});

function mockRect(
  el: HTMLElement,
  rect: { left: number; right: number; top: number; bottom: number },
) {
  el.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

describe("sidebar toggle clearance", () => {
  it("starts the figures after a toggle that sits further right", () => {
    document.body.innerHTML = `
      <button type="button" aria-label="Toggle sidebar"></button>
      <div data-testid="app-sidebar-top-reserve-row"></div>
    `;
    const slot = ensureUsageSlot(document);
    const button = document.querySelector<HTMLElement>(SIDEBAR_TOGGLE_SELECTOR);
    expect(slot).not.toBeNull();
    expect(button).not.toBeNull();
    mockRect(slot!, { left: 0, right: 280, top: 0, bottom: 32 });
    mockRect(button!, { left: 84, right: 112, top: 0, bottom: 28 });
    expect(sidebarToggleClearancePx(slot!)).toBe(120);
    syncUsageSlotPadding(slot!);
    expect(slot?.style.getPropertyValue("--sidebar-pro-usage-pad")).toBe(
      "max(calc(2.25rem + 1ch), 120px)",
    );
  });

  it("keeps the browser padding when the toggle does not cross the slot", () => {
    document.body.innerHTML = `
      <button type="button" aria-label="Toggle sidebar"></button>
      <div data-testid="app-sidebar-top-reserve-row"></div>
    `;
    const slot = ensureUsageSlot(document);
    const button = document.querySelector<HTMLElement>(SIDEBAR_TOGGLE_SELECTOR);
    expect(slot).not.toBeNull();
    expect(button).not.toBeNull();
    mockRect(slot!, { left: 0, right: 280, top: 0, bottom: 32 });
    mockRect(button!, { left: 0, right: 28, top: 80, bottom: 108 });
    expect(sidebarToggleClearancePx(slot!)).toBeNull();
    syncUsageSlotPadding(slot!);
    expect(slot?.style.getPropertyValue("--sidebar-pro-usage-pad")).toBe("");
  });
});
