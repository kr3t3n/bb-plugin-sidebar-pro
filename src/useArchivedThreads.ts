import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ARCHIVED_CHANNEL } from "./archived-contract";
import { archivedRowToSidebar } from "./archived-map";
import type { t3sidebarRpcContract } from "./server";

export type ArchivedThreadsState = {
  status: "idle" | "loading" | "ready" | "error";
  threads: PluginSidebarThread[];
  truncated: boolean;
  refresh: () => Promise<void>;
  unarchive: (threadId: string) => Promise<void>;
};

/**
 * Loads archived threads when `enabled`. The host sidebar feed omits them, so
 * this hits the plugin RPC (`bb.sdk.threads.list({ archived: true })`).
 */
export function useArchivedThreads(args: {
  enabled: boolean;
  projectId: string | null;
}): ArchivedThreadsState {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [status, setStatus] = useState<ArchivedThreadsState["status"]>("idle");
  const [threads, setThreads] = useState<PluginSidebarThread[]>([]);
  const [truncated, setTruncated] = useState(false);

  const refresh = useCallback(async () => {
    if (!args.enabled) {
      setStatus("idle");
      setThreads([]);
      setTruncated(false);
      return;
    }
    setStatus("loading");
    try {
      const result = await rpc.call("listArchived", {
        ...(args.projectId ? { projectId: args.projectId } : {}),
      });
      setThreads((result.threads ?? []).map(archivedRowToSidebar));
      setTruncated(Boolean(result.truncated));
      setStatus("ready");
    } catch {
      setThreads([]);
      setTruncated(false);
      setStatus("error");
    }
  }, [args.enabled, args.projectId, rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(ARCHIVED_CHANNEL, () => {
    if (!args.enabled) return;
    void refresh();
  });

  const unarchive = useCallback(
    async (threadId: string) => {
      await rpc.call("unarchive", { threadId });
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      await refresh();
    },
    [refresh, rpc],
  );

  return { status, threads, truncated, refresh, unarchive };
}
