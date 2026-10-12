import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { sameSidebarThread } from "./thread-equality";

const row = (patch: Record<string, unknown> = {}) =>
  ({
    id: "thr_1",
    title: "A",
    isUnread: false,
    activity: { workflows: 0, backgroundAgents: 0 },
    environment: { id: "env", branchName: "main" },
    host: null,
    ...patch,
  }) as unknown as PluginSidebarThread;

describe("sameSidebarThread", () => {
  it("treats a rebuilt row with the same content as the same", () => {
    expect(sameSidebarThread(row(), row())).toBe(true);
  });

  it.each([
    ["a top-level field", { isUnread: true }],
    [
      "a nested activity count",
      { activity: { workflows: 1, backgroundAgents: 0 } },
    ],
    ["the branch", { environment: { id: "env", branchName: "feature" } }],
    ["a nested object that appears", { host: { id: "h", name: "mac" } }],
  ])("sees a change in %s", (_name, patch) => {
    expect(sameSidebarThread(row(), row(patch))).toBe(false);
  });
});
