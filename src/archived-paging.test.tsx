// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { ARCHIVED_CHANNEL } from "./archived-contract";

// Load through the harness first, so the hook module binds to the test runtime.
const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const { mergeArchivedRows } = await import("./useArchivedThreads");

const archivedRow = (id: string, title: string, updatedAt: number) => ({
  id,
  projectId: "proj_1",
  title,
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
  isPinned: false,
  environment: null,
  createdAt: updatedAt,
  updatedAt,
  lastReadAt: updatedAt,
  latestAttentionAt: updatedAt,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("mergeArchivedRows", () => {
  it("drops duplicates from shifted pages and keeps newest first", () => {
    const row = (id: string, updatedAt: number) =>
      ({ id, updatedAt }) as unknown as PluginSidebarThread;
    const merged = mergeArchivedRows(
      [row("a", 3), row("b", 2)],
      [row("b", 2), row("c", 1), row("d", 4)],
    );
    expect(merged.map((thread) => thread.id)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("paged archive view", () => {
  function renderArchive(
    pages: Record<number, ReturnType<typeof archivedRow>[]>,
  ) {
    const view = renderSlot(
      inbox,
      {
        activeThreadId: null,
        activeProjectId: null,
        isCompactViewport: false,
        onNavigate: () => {},
        searchQuery: "",
      },
      {
        sidebarThreads: {
          status: "ready",
          threads: [],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false }],
        },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          linkOrigins: () => ({ localOrigin: "x", cloudOrigin: null }),
          listArchived: ({ offset = 0 }: { offset?: number }) => {
            const rows = pages[offset] ?? [];
            return {
              threads: rows,
              pageRows: rows.length,
              hasMore: pages[offset + rows.length] !== undefined,
            };
          },
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show archived threads" }),
    );
    return view;
  }

  const offsetsCalled = (view: ReturnType<typeof renderArchive>) =>
    view.rpcCalls
      .filter((call) => call.method === "listArchived")
      .map((call) => (call.input as { offset?: number }).offset ?? 0);

  it("loads the next page while the result is shorter than a screen", async () => {
    const view = renderArchive({
      0: [archivedRow("new", "Newest run", 300)],
      1: [archivedRow("old", "Older run", 100)],
    });
    expect(await screen.findByText("Older run")).toBeDefined();
    expect(screen.getByText("Newest run")).toBeDefined();
    expect(offsetsCalled(view)).toEqual([0, 1]);
  });

  it("removes an unarchived row without reloading", async () => {
    const view = renderArchive({
      0: [archivedRow("gone", "Restored run", 300)],
    });
    expect(await screen.findByText("Restored run")).toBeDefined();
    const before = offsetsCalled(view).length;
    await view.emitRealtime(ARCHIVED_CHANNEL, {
      type: "unarchived",
      threadId: "gone",
    });
    await waitFor(() => expect(screen.queryByText("Restored run")).toBeNull());
    expect(offsetsCalled(view)).toHaveLength(before);
  });
});
