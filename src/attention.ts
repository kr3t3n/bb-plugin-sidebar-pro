import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { matchesStatusFilter } from "./inbox";

/**
 * A thread that just got an agent response, or that needs the user now.
 * Covers unread success, waiting-for-input, unread-error, and the unread flag.
 */
export function threadNeedsAttention(thread: PluginSidebarThread): boolean {
  return (
    matchesStatusFilter(thread, "needs_you") ||
    matchesStatusFilter(thread, "unread")
  );
}

/** How many non-archived threads need attention right now. */
export function countAttentionThreads(
  threads: readonly PluginSidebarThread[],
): number {
  let count = 0;
  for (const thread of threads) {
    if (thread.isArchived) continue;
    if (threadNeedsAttention(thread)) count += 1;
  }
  return count;
}

/**
 * Automation attention that must stay unread: the run failed, or the agent is
 * asking the user (approval / question / pending interaction).
 */
export function threadBlocksAutomationClear(
  thread: PluginSidebarThread,
): boolean {
  return (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input" ||
    thread.indicator === "unread-error"
  );
}

function threadHasLabel(
  threadId: string,
  labelId: string,
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]>,
): boolean {
  const ids = labelIdsByThreadId.get(threadId);
  return ids !== undefined && ids.includes(labelId);
}

/**
 * Split unread/attention threads that carry the automation label into ones
 * safe to mark read vs ones that still need the user (error or question).
 */
export function partitionAutomationAttention(
  threads: readonly PluginSidebarThread[],
  automationLabelId: string | null,
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]> | null,
): {
  clearable: PluginSidebarThread[];
  blocked: PluginSidebarThread[];
} {
  const clearable: PluginSidebarThread[] = [];
  const blocked: PluginSidebarThread[] = [];
  if (automationLabelId === null || labelIdsByThreadId === null) {
    return { clearable, blocked };
  }
  for (const thread of threads) {
    if (thread.isArchived) continue;
    if (!threadHasLabel(thread.id, automationLabelId, labelIdsByThreadId)) {
      continue;
    }
    if (!threadNeedsAttention(thread)) continue;
    if (threadBlocksAutomationClear(thread)) blocked.push(thread);
    else clearable.push(thread);
  }
  return { clearable, blocked };
}
