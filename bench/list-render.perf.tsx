// @vitest-environment jsdom
//
// Measures how long the inbox takes to mount and to re-render with a large
// thread list. Run with `npm run perf`. Compare numbers on the same machine.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;

const COUNT = Number(process.env.PERF_THREADS ?? 5000);
const ROUNDS = 3;
const INDICATORS = ["none", "none", "none", "unread-success", "waiting-for-input", "runtime"] as const;
const PROVIDERS = ["claude-code", "codex", "cursor"];

// jsdom has no layout. Give the scroll container a 900px viewport and each
// row its real height, so a virtualised list renders what a sidebar shows.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    if (this.classList.contains("overflow-y-auto")) return 900;
    if (this.tagName === "LI") return 76;
    return 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 280 });

function threads(): PluginSidebarThread[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: `thr_${i}`,
    projectId: `proj_${i % 4}`,
    title: `Thread ${i} about the ${i % 7 === 0 ? "heartbeat" : "inbox"}`,
    titleFallback: null,
    parentThreadId: i % 25 === 1 ? `thr_${i - 1}` : null,
    sectionId: null,
    originKind: null,
    originPluginId: i % 5 === 0 ? null : "automations",
    providerId: PROVIDERS[i % 3]!,
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: i % 50 === 0 ? 1 : 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: INDICATORS[i % INDICATORS.length]!,
    indicatorLabel: null,
    isUnread: i % 6 === 3,
    isPinned: i < 3,
    isArchived: false,
    environment: { id: "env", name: "checkout", branchName: i % 2 ? "main" : null, providerId: null, workspaceDisplayKind: "other" },
    host: null,
    createdAt: 1_000_000 + i,
    updatedAt: 1_000_000 + i,
    lastReadAt: null,
    latestAttentionAt: 1_000_000 + i,
  })) as unknown as PluginSidebarThread[];
}

const props = (searchQuery: string) => ({
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery,
});

afterEach(() => cleanup());

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe(`inbox with ${COUNT} threads`, () => {
  it("mounts and re-renders", () => {
    const list = threads();
    const mounts: number[] = [];
    const updates: number[] = [];
    let rows = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const start = performance.now();
      const view = renderSlot(inbox, props(""), {
        sidebarThreads: { status: "ready", threads: list, projects: [0, 1, 2, 3].map((n) => ({ id: `proj_${n}`, name: `Project ${n}`, isPersonal: false })) },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          linkOrigins: () => ({ localOrigin: "http://127.0.0.1:38886", cloudOrigin: null }),
        },
      });
      mounts.push(performance.now() - start);
      rows = screen.queryAllByRole("listitem").length;
      // A whitespace query reruns the filter step without changing the
      // result, like a host feed update where one thread changed.
      for (let tick = 0; tick < 3; tick += 1) {
        const before = performance.now();
        view.rerender(<inbox.component {...props(tick % 2 ? " " : "  ")} />);
        updates.push(performance.now() - before);
      }
      cleanup();
    }
    console.log(
      `[perf] threads=${COUNT} rowsInDom=${rows} mountMedianMs=${median(mounts).toFixed(1)} updateMedianMs=${median(updates).toFixed(1)}`,
    );
    expect(rows).toBeGreaterThan(0);
  });
});
