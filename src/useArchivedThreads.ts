import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ARCHIVED_CHANNEL, type ArchivedChange } from "./archived-contract";
import { archivedRowToSidebar } from "./archived-map";
import type { t3sidebarRpcContract } from "./server";

export type ArchivedThreadsState = {
  status: "idle" | "loading" | "ready" | "error";
  threads: PluginSidebarThread[];
  /** More archived threads exist past the loaded pages. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Load the next page; a no-op while one loads or when none is left. */
  loadMore: () => void;
  refresh: () => Promise<void>;
  unarchive: (threadId: string) => Promise<void>;
};

// Archiving runs in bursts (the automation sweep archives 120 runs in a
// minute). Collect a burst into one first-page reload.
const ARCHIVE_EVENT_DELAY_MS = 1_000;

/** Merge rows by id. `incoming` wins; order is newest first by update. */
export function mergeArchivedRows(
  current: readonly PluginSidebarThread[],
  incoming: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  const byId = new Map(current.map((thread) => [thread.id, thread]));
  for (const thread of incoming) byId.set(thread.id, thread);
  return [...byId.values()].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  );
}

/**
 * Loads archived threads a page at a time when `enabled`. The host sidebar
 * feed omits them, so this hits the plugin RPC
 * (`bb.sdk.threads.list({ archived: true })`).
 *
 * The host orders archived rows by last update, and archiving updates a row,
 * so new archives arrive at the top and push older rows to later offsets.
 * Rows merge by id, so a shifted page adds no duplicates.
 */
export function useArchivedThreads(args: {
  enabled: boolean;
  projectId: string | null;
}): ArchivedThreadsState {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [status, setStatus] = useState<ArchivedThreadsState["status"]>("idle");
  const [threads, setThreads] = useState<PluginSidebarThread[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Host rows read so far: the offset of the next page. Zero means the scope
  // has no rows loaded yet.
  const nextOffset = useRef(0);
  const loadingMoreRef = useRef(false);
  // A scope change or disable makes every reply in flight stale.
  const generation = useRef(0);

  const loadPage = useCallback(
    async (offset: number) =>
      rpc.call("listArchived", {
        ...(args.projectId ? { projectId: args.projectId } : {}),
        offset,
      }),
    [args.projectId, rpc],
  );

  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    if (!args.enabled) {
      nextOffset.current = 0;
      setStatus("idle");
      setThreads([]);
      setHasMore(false);
      return;
    }
    // Only the first load shows "Loading". A reload keeps the rows on
    // screen, so the list does not blank on every archive event.
    setStatus((current) => (current === "ready" ? current : "loading"));
    try {
      const result = await loadPage(0);
      if (seq !== generation.current) return;
      const rows = (result.threads ?? []).map(archivedRowToSidebar);
      const first = nextOffset.current === 0;
      if (first) {
        nextOffset.current = result.pageRows;
        setHasMore(result.hasMore);
      }
      setThreads((current) => mergeArchivedRows(first ? [] : current, rows));
      setStatus("ready");
    } catch {
      if (seq !== generation.current) return;
      setStatus((current) => (current === "ready" ? current : "error"));
    }
  }, [args.enabled, loadPage]);

  // A new scope (project, or the view turned on) starts from the first page.
  useEffect(() => {
    nextOffset.current = 0;
    setThreads([]);
    setHasMore(false);
    setStatus("idle");
    void refresh();
  }, [refresh]);

  const loadMore = useCallback(() => {
    if (!args.enabled || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = generation.current;
    void loadPage(nextOffset.current)
      .then((result) => {
        if (seq !== generation.current) return;
        nextOffset.current += result.pageRows;
        setHasMore(result.hasMore);
        setThreads((current) =>
          mergeArchivedRows(
            current,
            (result.threads ?? []).map(archivedRowToSidebar),
          ),
        );
      })
      .catch(() => {
        // Keep what is loaded; the next scroll asks again.
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [args.enabled, hasMore, loadPage]);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) clearTimeout(reloadTimer.current);
    },
    [],
  );

  useRealtime(ARCHIVED_CHANNEL, (payload) => {
    if (!args.enabled) return;
    const change = payload as Partial<ArchivedChange>;
    if (
      (change.type === "unarchived" || change.type === "deleted") &&
      typeof change.threadId === "string"
    ) {
      const threadId = change.threadId;
      setThreads((current) =>
        current.some((thread) => thread.id === threadId)
          ? current.filter((thread) => thread.id !== threadId)
          : current,
      );
      return;
    }
    // A new archive lands at the top: reload the first page once per burst.
    if (reloadTimer.current !== null) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void refresh();
    }, ARCHIVE_EVENT_DELAY_MS);
  });

  const unarchive = useCallback(
    async (threadId: string) => {
      await rpc.call("unarchive", { threadId });
      setThreads((current) =>
        current.filter((thread) => thread.id !== threadId),
      );
    },
    [rpc],
  );

  return {
    status,
    threads,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    unarchive,
  };
}
