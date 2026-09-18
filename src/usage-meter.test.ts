// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderUsageMeters } from "./usage-meter";

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
    expect(root.querySelector("[data-provider-id='codex']")?.getAttribute("aria-label")).toContain(
      "11% left",
    );
  });
});
