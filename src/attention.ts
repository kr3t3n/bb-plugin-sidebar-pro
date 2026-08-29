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
