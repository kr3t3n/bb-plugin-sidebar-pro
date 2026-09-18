import { describe, expect, it } from "vitest";
import {
  formatReset,
  limitTone,
  normalizeProviderLimits,
  providerLimitLabel,
  remainingPercent,
  signalLevel,
} from "./provider-limits";

describe("remainingPercent", () => {
  it("reports quota still left", () => {
    expect(remainingPercent(89)).toBe(11);
    expect(remainingPercent(100)).toBe(0);
    expect(remainingPercent(0)).toBe(100);
    expect(remainingPercent(null)).toBeNull();
  });
});

describe("signalLevel", () => {
  it("fills more bars when more quota remains", () => {
    expect(signalLevel(null)).toBe(0);
    expect(signalLevel(0)).toBe(0);
    expect(signalLevel(11)).toBe(1);
    expect(signalLevel(40)).toBe(2);
    expect(signalLevel(60)).toBe(3);
    expect(signalLevel(85)).toBe(4);
  });
});

describe("limitTone", () => {
  it("marks a nearly full window as critical", () => {
    expect(limitTone(11)).toBe("critical");
    expect(limitTone(30)).toBe("low");
    expect(limitTone(85)).toBe("ok");
    expect(limitTone(null)).toBe("unknown");
  });
});

describe("normalizeProviderLimits", () => {
  it("keeps Codex, Anthropic, and Cursor and drops account email", () => {
    const providers = normalizeProviderLimits({
      codex: {
        status: "ok",
        accountEmail: "secret@example.com",
        windows: [{ label: "Weekly limit", usedPercent: 89, resetsAt: null }],
      },
      "claude-code": {
        status: "ok",
        windows: [
          { label: "Current session", usedPercent: 100, resetsAt: null },
          { label: "Weekly limit", usedPercent: 15, resetsAt: null },
        ],
      },
      "acp-cursor": { status: "unauthenticated" },
      other: { status: "ok", windows: [{ label: "Nope", usedPercent: 1 }] },
    });

    expect(providers.map((row) => row.providerId)).toEqual([
      "codex",
      "claude-code",
      "acp-cursor",
    ]);
    expect(providers[0]?.windows[0]?.remainingPercent).toBe(11);
    expect(providers[1]?.windows.map((window) => window.remainingPercent)).toEqual([
      0, 85,
    ]);
    expect(providers[2]?.status).toBe("unavailable");
    expect(JSON.stringify(providers)).not.toContain("secret@example.com");
  });
});

describe("providerLimitLabel", () => {
  it("states percent left and the reset time", () => {
    const iso = "2026-09-19T18:26:36.000Z";
    const label = providerLimitLabel({
      providerId: "codex",
      label: "Codex",
      status: "ok",
      windows: [
        {
          label: "Weekly limit",
          usedPercent: 89,
          remainingPercent: 11,
          resetsAt: iso,
        },
      ],
    });
    expect(label).toContain("Codex.");
    expect(label).toContain("Weekly limit: 11% left.");
    expect(label).toContain(`Resets ${formatReset(iso)}.`);
  });
});
