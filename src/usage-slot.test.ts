// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { USAGE_SLOT_ATTR, ensureUsageSlot } from "./usage-slot";

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
