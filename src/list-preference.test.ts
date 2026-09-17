// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_LABELS,
  ALL_PROVIDERS,
  DEFAULT_PREFERENCE,
  labelFilterSummary,
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

describe("list preference label filter", () => {
  it("defaults to All labels with an empty selection", () => {
    expect(DEFAULT_PREFERENCE.labelFilterMode).toBe("all");
    expect(DEFAULT_PREFERENCE.labelIds).toEqual([]);
    expect(loadListPreference().labelFilterMode).toBe("all");
  });

  it("persists multi-select hide preferences", () => {
    const preference: ListPreference = {
      statusFilter: "unread",
      providerId: "codex",
      labelFilterMode: "hide",
      labelIds: ["lbl_auto", "lbl_bug"],
      sort: "title_asc",
      density: "compact",
      showArchived: false,
    };
    saveListPreference(preference);
    expect(loadListPreference()).toEqual(preference);
  });

  it("migrates single labelId + labelMode from older prefs", () => {
    window.localStorage.setItem(
      "bb-plugin-sidebar-pro:list-preference:v1",
      JSON.stringify({
        statusFilter: "all",
        providerId: ALL_PROVIDERS,
        labelId: "lbl_automations",
        labelMode: "hide",
        sort: "created_desc",
        density: "spacious",
      }),
    );
    const loaded = loadListPreference();
    expect(loaded.labelFilterMode).toBe("hide");
    expect(loaded.labelIds).toEqual(["lbl_automations"]);
  });

  it("treats legacy All labels sentinel as empty selection", () => {
    window.localStorage.setItem(
      "bb-plugin-sidebar-pro:list-preference:v1",
      JSON.stringify({
        statusFilter: "all",
        providerId: ALL_PROVIDERS,
        labelId: ALL_LABELS,
        labelMode: "only",
        sort: "created_desc",
        density: "spacious",
      }),
    );
    const loaded = loadListPreference();
    expect(loaded.labelFilterMode).toBe("all");
    expect(loaded.labelIds).toEqual([]);
  });
});

describe("labelFilterSummary", () => {
  const names = new Map([
    ["a", "automation"],
    ["b", "bug"],
    ["c", "customer"],
  ]);

  it("summarises all / one / two / many", () => {
    expect(labelFilterSummary("all", [], names)).toBe("All labels");
    expect(labelFilterSummary("hide", ["a"], names)).toBe("Hide · automation");
    expect(labelFilterSummary("hide", ["a", "b"], names)).toBe(
      "Hide · automation, bug",
    );
    expect(labelFilterSummary("only", ["a", "b", "c"], names)).toBe(
      "Only · 3 labels",
    );
  });
});
