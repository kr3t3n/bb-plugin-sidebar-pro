import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { countAttentionThreads, threadNeedsAttention } from "./attention";

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

describe("threadNeedsAttention", () => {
  it("is true for unread threads", () => {
    expect(threadNeedsAttention(thread({ isUnread: true }))).toBe(true);
  });

  it("is true for unread-success", () => {
    expect(
      threadNeedsAttention(thread({ indicator: "unread-success" })),
    ).toBe(true);
  });

  it("is true when waiting for input", () => {
    expect(
      threadNeedsAttention(thread({ indicator: "waiting-for-input" })),
    ).toBe(true);
  });

  it("is true for pending interaction", () => {
    expect(
      threadNeedsAttention(thread({ hasPendingInteraction: true })),
    ).toBe(true);
  });

  it("is false for a quiet idle thread", () => {
    expect(threadNeedsAttention(thread())).toBe(false);
  });
});

describe("countAttentionThreads", () => {
  it("skips archived threads", () => {
    expect(
      countAttentionThreads([
        thread({ id: "a", isUnread: true }),
        thread({ id: "b", isUnread: true, isArchived: true }),
      ]),
    ).toBe(1);
  });
});
