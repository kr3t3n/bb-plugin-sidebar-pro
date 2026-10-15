import { describe, expect, it } from "vitest";
import { parseThreadUsage, threadUsageLimit } from "./thread-usage";

const now = Date.parse("2026-10-15T18:00:00Z");
const usage = (windows: object[], status = "ok") => parseThreadUsage({
  "claude-code": { status, windows },
}) ?? undefined;
const window = (patch: object = {}) => ({
  label: "Weekly limit", usedPercent: 100, resetsAt: "2026-10-16T18:00:00Z", ...patch,
});

describe("thread usage limits", () => {
  it("marks the affected provider and reports the latest blocking reset", () => {
    const data = usage([window(), window({ label: "Session", resetsAt: "2026-10-15T20:00:00Z" })]);
    expect(threadUsageLimit(data, "claude-code", now)?.resetsAt).toBe(Date.parse("2026-10-16T18:00:00Z"));
    expect(threadUsageLimit(data, "codex", now)).toBeNull();
  });

  it.each([
    { usedPercent: 99.9 },
    { usedPercent: null },
    { resetsAt: "2026-10-15T17:59:00Z" },
    { resetsAt: "2026-10-15T18:00:00Z" },
    { model: "fable" },
    { model: "" },
    { label: "Weekly Fable limit" },
  ])("does not mark a near limit, expired window or model-only window: %j", (patch) => {
    expect(threadUsageLimit(usage([window(patch)]), "claude-code", now)).toBeNull();
  });

  it.each(["error", "unavailable", "unauthenticated", "expired"])("does not infer exhaustion from %s", (status) => {
    expect(threadUsageLimit(usage([window()], status), "claude-code", now)).toBeNull();
  });

  it("keeps an exhausted unknown-reset window without inventing a reset", () => {
    const limit = threadUsageLimit(usage([window({ resetsAt: null })]), "claude-code", now);
    expect(limit?.resetsAt).toBeNull();
    expect(limit?.detail).toContain("Reset time unavailable");
  });

  it("does not promise recovery while another blocking reset is unknown", () => {
    expect(threadUsageLimit(usage([window(), window({ resetsAt: null })]), "claude-code", now)?.resetsAt).toBeNull();
  });

  it("clears the label when usage recovers", () => {
    expect(threadUsageLimit(usage([window({ usedPercent: 0 })]), "claude-code", now)).toBeNull();
  });

  it.each([null, [], { codex: { status: "ok", windows: [{ usedPercent: "100" }] } }])("rejects malformed usage data", (raw) => {
    expect(parseThreadUsage(raw)).toBeNull();
  });
});
