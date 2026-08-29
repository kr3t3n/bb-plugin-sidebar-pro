import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk";
import {
  ALL_PROVIDERS,
  type LabelFilterMode,
  type StatusFilter,
  type ThreadSort,
} from "./list-preference";

/**
 * Default T3 sort: newest created on top. Sidebar Pro keeps this as one of
 * several sorts; ties break on id so the order is total and stable.
 */
export function sortByCreatedAtDescending<
  T extends { readonly id: string; readonly createdAt: number },
>(threads: readonly T[]): T[] {
  return [...threads].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

const WORKING_INDICATORS: ReadonlySet<PluginSidebarThreadIndicator> = new Set([
  "working-draft",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "goal",
  "runtime",
]);

const NEEDS_YOU_INDICATORS: ReadonlySet<PluginSidebarThreadIndicator> = new Set(
  ["waiting-for-input", "unread-error"],
);

export function matchesStatusFilter(
  thread: PluginSidebarThread,
  filter: StatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_you":
      return (
        thread.hasPendingInteraction ||
        NEEDS_YOU_INDICATORS.has(thread.indicator)
      );
    case "working":
      return WORKING_INDICATORS.has(thread.indicator);
    case "unread":
      return thread.isUnread || thread.indicator === "unread-success";
    case "idle":
      return thread.indicator === "none" && !thread.isUnread;
    case "draft":
      return thread.indicator === "draft";
  }
}

export function filterByStatus(
  threads: readonly PluginSidebarThread[],
  filter: StatusFilter,
): PluginSidebarThread[] {
  if (filter === "all") return [...threads];
  return threads.filter((thread) => matchesStatusFilter(thread, filter));
}

export function filterByProvider(
  threads: readonly PluginSidebarThread[],
  providerId: string,
): PluginSidebarThread[] {
  if (providerId === ALL_PROVIDERS) return [...threads];
  return threads.filter((thread) => thread.providerId === providerId);
}

/**
 * Apply the Labels Pro multi-label filter.
 * - `all` or empty `labelIds`: no-op
 * - `only`: keep threads that carry any selected label
 * - `hide`: drop threads that carry any selected label
 * Missing map entries mean "no labels" on that thread.
 */
export function filterByLabel(
  threads: readonly PluginSidebarThread[],
  labelIds: readonly string[],
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]> | null,
  mode: LabelFilterMode = "only",
): PluginSidebarThread[] {
  if (
    mode === "all" ||
    labelIds.length === 0 ||
    labelIdsByThreadId === null
  ) {
    return [...threads];
  }
  const selected = new Set(labelIds);
  return threads.filter((thread) => {
    const ids = labelIdsByThreadId.get(thread.id) ?? [];
    const hit = ids.some((id) => selected.has(id));
    return mode === "hide" ? !hit : hit;
  });
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

/** Apply the chosen sort. Id is the always-stable tie-breaker. */
export function sortThreads(
  threads: readonly PluginSidebarThread[],
  sort: ThreadSort,
): PluginSidebarThread[] {
  const copy = [...threads];
  switch (sort) {
    case "created_desc":
      return sortByCreatedAtDescending(copy);
    case "created_asc":
      return copy.sort(
        (left, right) =>
          left.createdAt - right.createdAt || compareIds(left, right),
      );
    case "attention_desc":
      return copy.sort(
        (left, right) =>
          right.latestAttentionAt - left.latestAttentionAt ||
          compareIds(left, right),
      );
    case "attention_asc":
      return copy.sort(
        (left, right) =>
          left.latestAttentionAt - right.latestAttentionAt ||
          compareIds(left, right),
      );
    case "updated_desc":
      return copy.sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || compareIds(left, right),
      );
    case "updated_asc":
      return copy.sort(
        (left, right) =>
          left.updatedAt - right.updatedAt || compareIds(left, right),
      );
    case "title_asc":
      return copy.sort(
        (left, right) =>
          threadDisplayTitle(left).localeCompare(threadDisplayTitle(right)) ||
          compareIds(left, right),
      );
    case "title_desc":
      return copy.sort(
        (left, right) =>
          threadDisplayTitle(right).localeCompare(threadDisplayTitle(left)) ||
          compareIds(left, right),
      );
  }
}

/** Unique provider ids present in the current list, sorted for the picker. */
export function uniqueProviderIds(
  threads: readonly PluginSidebarThread[],
): string[] {
  return [...new Set(threads.map((thread) => thread.providerId))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function threadDisplayTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

/** Substring match on the visible title only, preserving the incoming order. */
export function searchThreadsByTitle(
  threads: readonly PluginSidebarThread[],
  query: string,
): PluginSidebarThread[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...threads];
  return threads.filter((thread) =>
    threadDisplayTitle(thread).toLowerCase().includes(normalized),
  );
}

export interface ProjectScope {
  /** Project id, or null for "all projects". */
  id: string | null;
  name: string;
}

/** Threads in the chosen scope; every thread when the scope is null. */
export function filterByProject(
  threads: readonly PluginSidebarThread[],
  projectId: string | null,
): PluginSidebarThread[] {
  if (projectId === null) return [...threads];
  return threads.filter((thread) => thread.projectId === projectId);
}

/** Archived threads never belong in the inbox. */
export function visibleInboxThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return threads.filter((thread) => !thread.isArchived);
}

/** Pinned first (they are the user's own ordering), then the static sort. */
export function partitionPinned(threads: readonly PluginSidebarThread[]): {
  pinned: PluginSidebarThread[];
  inbox: PluginSidebarThread[];
} {
  const pinned: PluginSidebarThread[] = [];
  const inbox: PluginSidebarThread[] = [];
  for (const thread of threads) {
    (thread.isPinned ? pinned : inbox).push(thread);
  }
  return { pinned, inbox };
}

/**
 * Child threads leave the flat list and live in their parent's header chip
 * instead — a flat inbox has nowhere to nest them.
 *
 * A child is only hidden when its parent is actually on screen. An orphan
 * (parent archived, deleted, or filtered out by the project scope) stays in
 * the list, because hiding it would make it unreachable everywhere.
 */
export function hideChildrenOfVisibleParents(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  const visibleIds = new Set(threads.map((thread) => thread.id));
  return threads.filter(
    (thread) =>
      thread.parentThreadId === null || !visibleIds.has(thread.parentThreadId),
  );
}

/**
 * The parent of one thread, or null when the thread is a root, when the id is
 * unknown, or when the parent row is gone (deleted). The parent may be
 * archived or in another project: the flat list hides those, but the child
 * still needs a way back to them.
 */
export function parentOf(
  threads: readonly PluginSidebarThread[],
  threadId: string,
): PluginSidebarThread | null {
  const thread = threads.find((candidate) => candidate.id === threadId);
  const parentThreadId = thread?.parentThreadId;
  if (!parentThreadId) return null;
  return threads.find((candidate) => candidate.id === parentThreadId) ?? null;
}

/** The children of one thread, oldest first (the order they were spawned). */
export function childrenOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  return threads
    .filter((thread) => thread.parentThreadId === parentThreadId)
    .sort((left, right) => left.createdAt - right.createdAt);
}
