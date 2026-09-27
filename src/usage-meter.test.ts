// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { USAGE_CARD_HINT, renderUsageCard, renderUsageMeters } from "./usage-meter";

describe("renderUsageMeters", () => {
  it("shows the percent still left beside each provider icon", () => {
    const root = document.createElement("div");
    renderUsageMeters(root, [
      {
        providerId: "codex",
        label: "Codex",
        status: "ok",
        windows: [
          {
            label: "Weekly limit",
            usedPercent: 89,
            remainingPercent: 11,
            resetsAt: null,
          },
        ],
      },
      {
        providerId: "claude-code",
        label: "Anthropic",
        status: "ok",
        windows: [
          {
            label: "Current session",
            usedPercent: 100,
            remainingPercent: 0,
            resetsAt: null,
          },
          {
            label: "Weekly limit",
            usedPercent: 15,
            remainingPercent: 85,
            resetsAt: null,
          },
        ],
      },
      {
        providerId: "acp-cursor",
        label: "Cursor",
        status: "ok",
        windows: [
          {
            label: "Plan usage",
            usedPercent: 15,
            remainingPercent: 85,
            resetsAt: null,
          },
        ],
      },
    ]);

    const text = [...root.querySelectorAll(".meter")].map(
      (node) => node.textContent,
    );
    expect(text).toEqual(["11%", "0%85%", "85%"]);
    const codex = root.querySelector("[data-provider-id='codex']");
    expect(codex?.tagName).toBe("BUTTON");
    expect(codex?.getAttribute("aria-label")).toContain("11% left");
    expect(codex?.getAttribute("aria-label")).toContain(USAGE_CARD_HINT);
  });
});

describe("renderUsageCard", () => {
  const now = Date.parse("2026-09-27T17:00:00.000Z");

  it("shows the plan and one row per window", () => {
    const root = document.createElement("div");
    renderUsageCard(
      root,
      {
        providerId: "claude-code",
        label: "Anthropic",
        status: "ok",
        planLabel: "Max (5x)",
        windows: [
          {
            label: "Current session",
            usedPercent: 70,
            remainingPercent: 30,
            resetsAt: "2026-09-27T19:20:00.000Z",
          },
          {
            label: "Weekly limit",
            usedPercent: 40,
            remainingPercent: 60,
            resetsAt: null,
          },
        ],
      },
      now,
    );

    expect(root.querySelector(".card-title")?.textContent).toBe("Anthropic");
    expect(root.querySelector(".card-plan")?.textContent).toBe("Max (5x)");
    const rows = [...root.querySelectorAll(".card-row")];
    expect(rows.map((row) => row.querySelector(".card-window")?.textContent)).toEqual([
      "Current session",
      "Weekly limit",
    ]);
    expect(rows[0]?.querySelector(".pct")?.textContent).toBe("30% left");
    expect(rows[0]?.querySelector(".pct")?.className).toContain("pct-low");
    expect(rows[0]?.querySelector(".card-detail")?.textContent).toContain("in 2h 20m");
    expect((rows[1]?.querySelector(".card-fill") as HTMLElement).style.width).toBe("60%");
    expect(root.querySelector(".card-hint")?.textContent).toBe(USAGE_CARD_HINT);
  });

  it("explains an unavailable provider", () => {
    const root = document.createElement("div");
    renderUsageCard(root, {
      providerId: "acp-cursor",
      label: "Cursor",
      status: "unavailable",
      windows: [],
    });
    expect(root.querySelector(".card-empty")?.textContent).toContain("unavailable");
    expect(root.querySelectorAll(".card-row")).toHaveLength(0);
  });
});
