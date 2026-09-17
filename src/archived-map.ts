import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { ArchivedThreadRow } from "./archived-contract";

/** Map an archived RPC row into the sidebar card shape. */
export function archivedRowToSidebar(
  row: ArchivedThreadRow,
): PluginSidebarThread {
  const isUnread =
    row.lastReadAt === null || row.lastReadAt < row.latestAttentionAt;
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    titleFallback: row.titleFallback,
    parentThreadId: row.parentThreadId,
    sectionId: row.sectionId,
    originKind: row.originKind,
    originPluginId: row.originPluginId,
    providerId: row.providerId,
    hasPendingInteraction: row.hasPendingInteraction,
    activity: {
      workflows: row.activity.workflows,
      backgroundAgents: row.activity.backgroundAgents,
      backgroundCommands: row.activity.backgroundCommands,
      planMode: row.activity.planMode,
      goals: row.activity.goals,
    },
    indicator: row.hasPendingInteraction ? "waiting-for-input" : "none",
    indicatorLabel: row.hasPendingInteraction
      ? "Thread needs user input"
      : null,
    isUnread,
    isPinned: row.isPinned,
    isArchived: true,
    environment: row.environment,
    host: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReadAt: row.lastReadAt,
    latestAttentionAt: row.latestAttentionAt,
  };
}
