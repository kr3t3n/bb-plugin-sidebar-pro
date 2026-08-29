// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_LABELS,
  ALL_PROVIDERS,
  DEFAULT_PREFERENCE,
  loadListPreference,
  saveListPreference,
  type ListPreference,
} from "./list-preference";

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // jsdom may reject Storage without --localstorage-file.
  }
});

describe("list preference labelId", () => {
  it("defaults labelId to All labels", () => {
    expect(DEFAULT_PREFERENCE.labelId).toBe(ALL_LABELS);
    expect(loadListPreference().labelId).toBe(ALL_LABELS);
  });

  it("persists and restores labelId alongside other fields", () => {
    const preference: ListPreference = {
      statusFilter: "unread",
      providerId: "codex",
      labelId: "lbl_automations",
      sort: "title_asc",
      density: "compact",
    };
    saveListPreference(preference);
    expect(loadListPreference()).toEqual(preference);
  });

  it("fills missing labelId from older stored prefs", () => {
    window.localStorage.setItem(
      "bb-plugin-sidebar-pro:list-preference:v1",
      JSON.stringify({
        statusFilter: "all",
        providerId: ALL_PROVIDERS,
        sort: "created_desc",
        density: "spacious",
      }),
    );
    expect(loadListPreference().labelId).toBe(ALL_LABELS);
  });
});
