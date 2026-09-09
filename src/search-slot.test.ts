// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  NEW_THREAD_ITEM_SELECTOR,
  SEARCH_OPEN_ATTR,
  SEARCH_SLOT_ATTR,
  ensureSearchSlot,
  setNewThreadSearchOpen,
} from "./search-slot";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ensureSearchSlot", () => {
  it("appends a slot inside the host New thread item", () => {
    document.body.innerHTML = `
      <div data-sidebar-navigation-item="__bb__/new-thread">
        <button type="button" aria-label="New thread">New thread</button>
      </div>
    `;
    const slot = ensureSearchSlot(document);
    expect(slot).not.toBeNull();
    const item = document.querySelector(NEW_THREAD_ITEM_SELECTOR);
    expect(item?.querySelector(`[${SEARCH_SLOT_ATTR}]`)).toBe(slot);
    expect(ensureSearchSlot(document)).toBe(slot);
  });

  it("returns null when the New thread item is missing", () => {
    document.body.innerHTML = `<button type="button" aria-label="New thread">New thread</button>`;
    expect(ensureSearchSlot(document)).toBeNull();
  });
});

describe("setNewThreadSearchOpen", () => {
  it("toggles the open flag on the New thread item", () => {
    document.body.innerHTML = `
      <div data-sidebar-navigation-item="__bb__/new-thread">
        <button type="button" aria-label="New thread">New thread</button>
      </div>
    `;
    setNewThreadSearchOpen(true);
    expect(
      document
        .querySelector(NEW_THREAD_ITEM_SELECTOR)
        ?.getAttribute(SEARCH_OPEN_ATTR),
    ).toBe("true");
    setNewThreadSearchOpen(false);
    expect(
      document
        .querySelector(NEW_THREAD_ITEM_SELECTOR)
        ?.hasAttribute(SEARCH_OPEN_ATTR),
    ).toBe(false);
  });
});
