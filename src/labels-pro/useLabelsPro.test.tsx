// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { SIDEBAR_LABEL_CHANGES_CHANNEL } from "./contract";

const app = await loadPluginApp(() => import("../../app"));
const inbox = app.threadLists[0]!;

const label = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  color: null,
  createdAt: 1,
  updatedAt: 1,
});

const thread = (id: string, title: string) =>
  ({
    id,
    projectId: "p",
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
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: 1,
    latestAttentionAt: 1,
  }) as unknown as PluginSidebarThread;

function stubLabelsPro(handler: (method: string, body: unknown) => unknown) {
  const calls: { method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = url.split("/").pop()!;
      const body = JSON.parse(String(init?.body ?? "null"));
      calls.push({ method, body });
      const result = handler(method, body);
      if (result === undefined) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: "unknown_method", message: "no" },
          }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
      });
    }),
  );
  return calls;
}

function render() {
  return renderSlot(
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
        threads: [thread("t1", "First")],
        projects: [],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        linkOrigins: () => ({ localOrigin: "x", cloudOrigin: null }),
      },
    },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("labels from a current Labels Pro", () => {
  it("loads once in bulk, applies pushed changes, and sends no per-label calls", async () => {
    const calls = stubLabelsPro((method) =>
      method === "listAssignments"
        ? {
            revision: 5,
            changed: true,
            labels: [label("a", "Alpha"), label("b", "Beta")],
            assignments: [{ labelId: "a", threadIds: ["t1"] }],
          }
        : undefined,
    );
    const view = render();
    expect(await screen.findByLabelText("Labels: Alpha")).toBeDefined();

    await view.emitRealtime(SIDEBAR_LABEL_CHANGES_CHANNEL, {
      revision: 6,
      threads: { t1: ["b", "a"] },
      labelsChanged: false,
    });
    expect(await screen.findByLabelText("Labels: Alpha, Beta")).toBeDefined();

    // An older message cannot undo a newer one.
    await view.emitRealtime(SIDEBAR_LABEL_CHANGES_CHANNEL, {
      revision: 6,
      threads: { t1: [] },
      labelsChanged: false,
    });
    expect(screen.getByLabelText("Labels: Alpha, Beta")).toBeDefined();

    expect(calls.map((call) => call.method)).toEqual(["listAssignments"]);
  });

  it("reloads with its revision when the connection comes back", async () => {
    const calls = stubLabelsPro((method, body) =>
      method === "listAssignments"
        ? (body as { sinceRevision?: number }).sinceRevision === 5
          ? { revision: 5, changed: false, labels: null, assignments: null }
          : {
              revision: 5,
              changed: true,
              labels: [label("a", "Alpha")],
              assignments: [],
            }
        : undefined,
    );
    const view = render();
    await waitFor(() => expect(calls).toHaveLength(1));
    await view.setRealtimeConnectionState("reconnecting");
    await view.setRealtimeConnectionState("connected");
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body).toEqual({ sinceRevision: 5 });
  });
});

describe("labels from an older Labels Pro", () => {
  it("falls back to one call per label", async () => {
    const calls = stubLabelsPro((method, body) => {
      if (method === "listLabels") return { labels: [label("a", "Alpha")] };
      if (method === "listThreadsByLabel") {
        return {
          label: label("a", "Alpha"),
          threadIds:
            (body as { labelId: string }).labelId === "a" ? ["t1"] : [],
        };
      }
      return undefined;
    });
    render();
    expect(await screen.findByLabelText("Labels: Alpha")).toBeDefined();
    expect(calls.map((call) => call.method)).toEqual([
      "listAssignments",
      "listLabels",
      "listThreadsByLabel",
    ]);
  });
});
