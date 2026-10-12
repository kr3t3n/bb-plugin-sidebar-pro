import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/Select";
import { ThreadCard } from "./ThreadCard";
import { SlimRow } from "./SlimRow";
import { useLifecycle } from "./useLifecycle";
import { LinkOriginsProvider } from "./useLinkOrigins";
import { useArchivedThreads } from "./useArchivedThreads";
import {
  countAttentionThreads,
  partitionAutomationAttention,
  threadNeedsAttention,
} from "./attention";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import {
  filterByLabel,
  filterListThreads,
  partitionPinned,
  sortThreads,
  uniqueProviderIds,
  visibleInboxThreads,
} from "./inbox";
import {
  ALL_PROVIDERS,
  DEFAULT_PREFERENCE,
  loadListPreference,
  saveListPreference,
  SORT_LABELS,
  SORTS,
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  type Density,
  type LabelFilterMode,
  type ListPreference,
  type StatusFilter,
  type ThreadSort,
} from "./list-preference";
import { useLabelsPro } from "./labels-pro/useLabelsPro";
import { labelsByThreadId, labelsFor } from "./labels-pro/client";
import { ShelfRows } from "./ShelfRows";

/**
 * The archive view loads older pages until the filters leave at least this
 * many rows, so a narrow filter still fills the screen.
 */
const ARCHIVED_FILL_ROWS = 60;
/** Load the next archive page when the view is this close to its end. */
const ARCHIVED_LOAD_AHEAD_PX = 1_500;

/** Expected row heights in pixels; rows are measured once they render. */
const ROW_HEIGHT = { spacious: 76, compact: 32, slim: 32 } as const;

const noop = () => undefined;
import { LabelFilterMenu } from "./LabelFilterMenu";
import { ThreadSearch } from "./ThreadSearch";

const ALL_PROJECTS = "__all__";

/**
 * The sidebar's scrolling list: inbox shelves plus Sidebar Pro controls
 * (status / provider filters, sort, compact↔spacious density, unread bell,
 * archived-threads toggle).
 *
 * The host keeps New thread. Search lives in Sidebar Pro and docks to the
 * right of that button when the content-script slot is present.
 */
export function ThreadInbox({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const threadActions = useSidebarThreadActions();
  const lifecycle = useLifecycle(threads);
  const labelsPro = useLabelsPro();
  const labelsReady = labelsPro.status === "ready";
  const [scope, setScope] = useState<string>(ALL_PROJECTS);
  const [preference, setPreference] = useState<ListPreference>(
    () => loadListPreference() ?? DEFAULT_PREFERENCE,
  );
  const showArchived = preference.showArchived;
  const archived = useArchivedThreads({
    enabled: showArchived,
    projectId: scope === ALL_PROJECTS ? null : scope,
  });
  // One clock for every card in a render, quantized to the minute so the
  // labels do not disagree and do not churn on unrelated re-renders.
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Typing stays responsive: the list filters on the deferred query, a
  // frame later, while the field updates at once.
  const deferredListQuery = useDeferredValue(listQuery);
  const effectiveQuery =
    deferredListQuery.trim() !== "" ? deferredListQuery : searchQuery;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rows are memoised, so every callback they receive must keep its identity
  // across renders. Refs carry the latest host callback and lifecycle store.
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const handleNavigate = useCallback(() => {
    setListQuery("");
    setSearchOpen(false);
    onNavigateRef.current();
  }, []);
  const handleSettle = useCallback(
    (threadId: string) => lifecycleRef.current.settle(threadId),
    [],
  );
  const handleSnooze = useCallback(
    (threadId: string, until: number) =>
      lifecycleRef.current.snooze(threadId, until),
    [],
  );

  // In-list count only. OS toasts + Dock badge live in Notifications Pro.
  const attentionCount = useMemo(
    () => countAttentionThreads(threads),
    [threads],
  );

  /** Bell action: show unread threads (toggle back to All). */
  const filterUnreadThreads = () => {
    updatePreference({
      statusFilter: preference.statusFilter === "unread" ? "all" : "unread",
      showArchived: false,
    });
  };

  /** Archive action: swap the list to archived threads (toggle back to inbox). */
  const toggleArchivedThreads = () => {
    updatePreference({ showArchived: !preference.showArchived });
  };

  const labelIdsByThreadId = labelsReady
    ? labelsPro.labelIdsByThreadId
    : null;

  /** Drop stale ids (deleted labels) from the persisted selection. */
  const knownLabelIdSet = useMemo(() => {
    if (!labelsReady) return null;
    return new Set(labelsPro.labels.map((label) => label.id));
  }, [labelsPro, labelsReady]);
  const effectiveLabelIds =
    knownLabelIdSet === null
      ? preference.labelIds
      : preference.labelIds.filter((id) => knownLabelIdSet.has(id));
  const effectiveLabelMode: LabelFilterMode =
    effectiveLabelIds.length === 0 ? "all" : preference.labelFilterMode;

  /** Mark attention threads read — respects the active label filter. */
  const markAllRead = () => {
    const candidates = filterByLabel(
      threads.filter((thread) => !thread.isArchived),
      effectiveLabelIds,
      labelIdsByThreadId,
      effectiveLabelMode,
    );
    const ids = candidates
      .filter((thread) => threadNeedsAttention(thread))
      .map((thread) => thread.id);
    void Promise.all(
      ids.map((id) => threadActions.setRead(id, true).catch(() => undefined)),
    );
  };

  /** Labels Pro `automation` label (slug or name), if present. */
  const automationLabelId = labelsReady
    ? (labelsPro.labels.find(
        (label) =>
          label.slug === "automation" ||
          label.name.toLowerCase() === "automation",
      )?.id ?? null)
    : null;

  const automationAttention = useMemo(
    () =>
      partitionAutomationAttention(
        threads,
        automationLabelId,
        labelIdsByThreadId,
      ),
    [automationLabelId, labelIdsByThreadId, threads],
  );

  /**
   * Mark unread automation threads read when the run looks fine. Skips
   * unread-error and any thread waiting on the user (question / approval).
   */
  const clearQuietAutomations = () => {
    const ids = automationAttention.clearable.map((thread) => thread.id);
    void Promise.all(
      ids.map((id) => threadActions.setRead(id, true).catch(() => undefined)),
    );
  };

  const updatePreference = (patch: Partial<ListPreference>) => {
    setPreference((current) => {
      const next = { ...current, ...patch };
      saveListPreference(next);
      return next;
    });
  };

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const providerIds = useMemo(
    () => uniqueProviderIds(visibleInboxThreads(threads)),
    [threads],
  );

  const { pinned, inbox, snoozed, settled } = useMemo(() => {
    const matched = filterListThreads(
      showArchived ? archived.threads : threads,
      {
        projectId: scope === ALL_PROJECTS ? null : scope,
        statusFilter: preference.statusFilter,
        providerId: preference.providerId,
        labelIds: effectiveLabelIds,
        labelIdsByThreadId,
        labelMode: effectiveLabelMode,
        // The archive view ignores the host's search box: it searches live
        // threads only.
        query: showArchived ? deferredListQuery : effectiveQuery,
        excludeArchived: !showArchived,
      },
    );

    if (showArchived) {
      const split = partitionPinned(matched);
      return {
        pinned: sortThreads(split.pinned, preference.sort),
        inbox: sortThreads(split.inbox, preference.sort),
        snoozed: [] as PluginSidebarThread[],
        settled: [] as PluginSidebarThread[],
      };
    }

    const active: typeof matched = [];
    const onSnoozeShelf: typeof matched = [];
    const onSettledShelf: typeof matched = [];
    for (const thread of matched) {
      const shelf = lifecycle.shelfFor(thread);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else active.push(thread);
    }
    const split = partitionPinned(active);
    return {
      pinned: sortThreads(split.pinned, preference.sort),
      inbox: sortThreads(split.inbox, preference.sort),
      // Soonest wake first: "what comes back next" is the shelf's question.
      snoozed: [...onSnoozeShelf].sort(
        (left, right) =>
          (lifecycle.wakeAtFor(left) ?? 0) - (lifecycle.wakeAtFor(right) ?? 0),
      ),
      settled: sortThreads(onSettledShelf, preference.sort),
    };
    // `effectiveLabelIds` is a new array on every render; its contents are
    // `preference.labelIds` filtered by the label snapshot, both listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    archived.threads,
    deferredListQuery,
    effectiveLabelMode,
    effectiveQuery,
    knownLabelIdSet,
    labelIdsByThreadId,
    lifecycle,
    preference,
    scope,
    showArchived,
    threads,
  ]);

  // Archived threads load a page at a time. Keep loading while the filters
  // leave less than a screen of matches, so a narrow filter or a search
  // still finds older threads.
  const archivedMatches = showArchived ? pinned.length + inbox.length : 0;
  const { hasMore: archivedHasMore, loadMore: loadMoreArchived } = archived;
  useEffect(() => {
    if (
      showArchived &&
      archived.status === "ready" &&
      archivedHasMore &&
      !archived.loadingMore &&
      archivedMatches < ARCHIVED_FILL_ROWS
    ) {
      loadMoreArchived();
    }
  }, [
    archived.loadingMore,
    archived.status,
    archivedHasMore,
    archivedMatches,
    loadMoreArchived,
    showArchived,
  ]);
  const handleListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!showArchived || !archivedHasMore) return;
    const element = event.currentTarget;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      ARCHIVED_LOAD_AHEAD_PX
    ) {
      loadMoreArchived();
    }
  };

  const scopeLabel =
    scope === ALL_PROJECTS
      ? "All projects"
      : (projectNameById.get(scope) ?? "All projects");

  const density: Density = preference.density;
  // Changes when a shelf appears or disappears above a long list, so that list
  // reads its offset in the scroll container again.
  const shelfLayoutKey = [
    showArchived,
    pinned.length > 0,
    inbox.length > 0,
    snoozed.length > 0,
    showSnoozed,
    settled.length > 0,
    density,
  ].join("|");

  const labelsByThread = useMemo(
    () =>
      labelsPro.status === "ready"
        ? labelsByThreadId(labelsPro.labels, labelsPro.labelIdsByThreadId)
        : null,
    [labelsPro],
  );

  const setLabelFilter = (mode: LabelFilterMode, labelIds: string[]) => {
    updatePreference({
      labelFilterMode: mode,
      labelIds,
    });
  };

  return (
    <LinkOriginsProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-col gap-0.5 px-2 pb-1 pt-3">
          <div className="flex items-center gap-1">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger
                className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs font-medium text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
                aria-label={`Project scope: ${scopeLabel}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS} className="text-xs">
                  All projects
                </SelectItem>
                {projects.map((project) => (
                  <SelectItem
                    key={project.id}
                    value={project.id}
                    className="text-xs"
                  >
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <UnreadFilterToggle
              unreadFilterActive={
                !showArchived && preference.statusFilter === "unread"
              }
              attentionCount={attentionCount}
              onFilterUnread={filterUnreadThreads}
            />
            <ArchivedThreadsToggle
              active={showArchived}
              onToggle={toggleArchivedThreads}
            />
            <MarkAllReadButton
              attentionCount={attentionCount}
              onMarkAllRead={markAllRead}
            />
            {labelsReady && automationLabelId !== null ? (
              <ClearQuietAutomationsButton
                clearableCount={automationAttention.clearable.length}
                blockedCount={automationAttention.blocked.length}
                onClear={clearQuietAutomations}
              />
            ) : null}
            <DensityToggle
              density={density}
              onToggle={() =>
                updatePreference({
                  density: density === "spacious" ? "compact" : "spacious",
                })
              }
            />
            <ThreadSearch
              query={listQuery}
              onQueryChange={setListQuery}
              open={searchOpen}
              onOpenChange={setSearchOpen}
            />
          </div>
          <div className="flex items-center gap-1">
            <Select
              value={preference.statusFilter}
              onValueChange={(value) =>
                updatePreference({ statusFilter: value as StatusFilter })
              }
            >
              <SelectTrigger
                className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
                aria-label={`Status filter: ${STATUS_FILTER_LABELS[preference.statusFilter]}`}
              >
                <Icon name="Filter" className="size-3 shrink-0 opacity-70" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((filter) => (
                  <SelectItem key={filter} value={filter} className="text-xs">
                    {STATUS_FILTER_LABELS[filter]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={preference.providerId}
              onValueChange={(value) =>
                updatePreference({ providerId: value })
              }
            >
              <SelectTrigger
                className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
                aria-label={`Provider filter: ${
                  preference.providerId === ALL_PROVIDERS
                    ? "All providers"
                    : preference.providerId
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROVIDERS} className="text-xs">
                  All providers
                </SelectItem>
                {providerIds.map((providerId) => (
                  <SelectItem
                    key={providerId}
                    value={providerId}
                    className="text-xs"
                  >
                    {providerId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {labelsReady ? (
              <LabelFilterMenu
                labels={labelsPro.labels}
                mode={effectiveLabelMode}
                selectedIds={effectiveLabelIds}
                onChange={setLabelFilter}
              />
            ) : null}
            <Select
              value={preference.sort}
              onValueChange={(value) =>
                updatePreference({ sort: value as ThreadSort })
              }
            >
              <SelectTrigger
                className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
                aria-label={`Sort: ${SORT_LABELS[preference.sort]}`}
              >
                <Icon name="Sort" className="size-3 shrink-0 opacity-70" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort} className="text-xs">
                    {SORT_LABELS[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleListScroll}
          className="relative min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
        >
          {showArchived && archived.status === "loading" ? (
            <p
              role="status"
              className="px-2 py-6 text-center text-xs text-muted-foreground"
            >
              Loading archived threads…
            </p>
          ) : showArchived && archived.status === "error" ? (
            <p
              role="status"
              className="px-2 py-6 text-center text-xs text-muted-foreground"
            >
              Could not load archived threads.
            </p>
          ) : status === "loading" && !showArchived ? null : status ===
              "error" && !showArchived ? (
            <p
              role="status"
              className="px-2 py-6 text-center text-xs text-muted-foreground"
            >
              Could not load threads.
            </p>
          ) : pinned.length + inbox.length + snoozed.length + settled.length ===
              0 &&
            !(showArchived && archived.hasMore) ? (
            <p
              role="status"
              className="px-2 py-6 text-center text-xs text-muted-foreground"
            >
              {showArchived
                ? deferredListQuery.trim() ||
                  preference.statusFilter !== "all" ||
                  preference.providerId !== ALL_PROVIDERS ||
                  (labelsReady && effectiveLabelMode !== "all")
                  ? "No archived threads found"
                  : "No archived threads"
                : effectiveQuery.trim() ||
                    preference.statusFilter !== "all" ||
                    preference.providerId !== ALL_PROVIDERS ||
                    (labelsReady && effectiveLabelMode !== "all")
                  ? "No threads found"
                  : "No threads yet"}
            </p>
          ) : (
            <>
              {showArchived ? (
                <Shelf label="Archived">
                  <ShelfRows
                    items={pinned.concat(inbox)}
                    rowHeight={ROW_HEIGHT[density]}
                    scrollRef={scrollRef}
                    layoutKey={shelfLayoutKey}
                    renderRow={(thread, placement) => (
                      <ThreadCard
                        key={thread.id}
                        thread={thread}
                        projectName={
                          projectNameById.get(thread.projectId) ?? null
                        }
                        isActive={thread.id === activeThreadId}
                        canPark={false}
                        density={density}
                        labels={labelsFor(thread.id, labelsByThread)}
                        onNavigate={handleNavigate}
                        onSettle={noop}
                        onSnooze={noop}
                        now={now}
                        placement={placement}
                      />
                    )}
                  />
                </Shelf>
              ) : (
                <>
                  {[
                    { label: "Pinned", rows: pinned },
                    {
                      label: pinned.length > 0 ? "Inbox" : null,
                      rows: inbox,
                    },
                  ].map(({ label, rows }) =>
                    rows.length > 0 ? (
                      <Shelf key={label ?? "inbox"} label={label}>
                        <ShelfRows
                          items={rows}
                          rowHeight={ROW_HEIGHT[density]}
                          scrollRef={scrollRef}
                          layoutKey={shelfLayoutKey}
                          renderRow={(thread, placement) => (
                            <ThreadCard
                              key={thread.id}
                              thread={thread}
                              projectName={
                                projectNameById.get(thread.projectId) ?? null
                              }
                              isActive={thread.id === activeThreadId}
                              canPark={lifecycle.canPark(thread)}
                              density={density}
                              labels={labelsFor(thread.id, labelsByThread)}
                              onNavigate={handleNavigate}
                              onSettle={handleSettle}
                              onSnooze={handleSnooze}
                              now={now}
                              placement={placement}
                            />
                          )}
                        />
                      </Shelf>
                    ) : null,
                  )}
                  <ParkedShelf
                    label="Snoozed"
                    threads={snoozed}
                    expanded={showSnoozed}
                    onToggle={() => setShowSnoozed((open) => !open)}
                    shelf="snoozed"
                    activeThreadId={activeThreadId}
                    lifecycle={lifecycle}
                    onNavigate={handleNavigate}
                    scrollRef={scrollRef}
                    layoutKey={shelfLayoutKey}
                  />
                  <ParkedShelf
                    label="Settled"
                    threads={settled}
                    expanded={showSettled}
                    onToggle={() => setShowSettled((open) => !open)}
                    shelf="settled"
                    activeThreadId={activeThreadId}
                    lifecycle={lifecycle}
                    onNavigate={handleNavigate}
                    scrollRef={scrollRef}
                    layoutKey={shelfLayoutKey}
                  />
                </>
              )}
              {showArchived && archived.hasMore ? (
                <p
                  role="status"
                  className="px-2 py-2 text-center text-[10px] text-muted-foreground"
                >
                  {archived.loadingMore
                    ? "Loading older archived threads…"
                    : "Scroll for older archived threads."}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </LinkOriginsProvider>
  );
}

function UnreadFilterToggle({
  unreadFilterActive,
  attentionCount,
  onFilterUnread,
}: {
  unreadFilterActive: boolean;
  attentionCount: number;
  onFilterUnread: () => void;
}) {
  const label = unreadFilterActive
    ? "Showing unread — click for all threads"
    : "Show unread threads";
  return (
    <button
      type="button"
      onClick={onFilterUnread}
      aria-label={label}
      aria-pressed={unreadFilterActive}
      title={label}
      className={
        unreadFilterActive
          ? "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-foreground"
          : "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <Icon name="Bell" className="size-3.5" aria-hidden />
      {attentionCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-semibold leading-none text-white"
        >
          {attentionCount > 99 ? "99+" : attentionCount}
        </span>
      ) : null}
    </button>
  );
}

/** Toggles the sidebar between the live inbox and archived threads. */
function ArchivedThreadsToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const label = active
    ? "Showing archived — click for inbox"
    : "Show archived threads";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={
        active
          ? "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-foreground"
          : "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <Icon name="Archive" className="size-3.5" aria-hidden />
    </button>
  );
}

function MarkAllReadButton({
  attentionCount,
  onMarkAllRead,
}: {
  attentionCount: number;
  onMarkAllRead: () => void;
}) {
  const disabled = attentionCount === 0;
  return (
    <button
      type="button"
      onClick={onMarkAllRead}
      disabled={disabled}
      aria-label="Mark all as read"
      title="Mark all as read"
      className={
        disabled
          ? "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40"
          : "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <Icon name="Check" className="size-3.5" aria-hidden />
    </button>
  );
}

function ClearQuietAutomationsButton({
  clearableCount,
  blockedCount,
  onClear,
}: {
  clearableCount: number;
  blockedCount: number;
  onClear: () => void;
}) {
  const disabled = clearableCount === 0;
  const title =
    clearableCount === 0 && blockedCount === 0
      ? "No unread automation threads"
      : clearableCount === 0
        ? `${blockedCount} automation thread${blockedCount === 1 ? "" : "s"} still need you (error or question)`
        : blockedCount > 0
          ? `Mark ${clearableCount} quiet automation${clearableCount === 1 ? "" : "s"} read — leave ${blockedCount} with errors/questions`
          : `Mark ${clearableCount} quiet automation thread${clearableCount === 1 ? "" : "s"} read`;
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      aria-label={title}
      title={title}
      className={
        disabled
          ? "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40"
          : "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <Icon name="Workflow" className="size-3.5" aria-hidden />
      {clearableCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[9px] font-semibold leading-none text-white"
        >
          {clearableCount > 99 ? "99+" : clearableCount}
        </span>
      ) : blockedCount > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-semibold leading-none text-white"
        >
          {blockedCount > 99 ? "99+" : blockedCount}
        </span>
      ) : null}
    </button>
  );
}

function DensityToggle({
  density,
  onToggle,
}: {
  density: Density;
  onToggle: () => void;
}) {
  const next = density === "spacious" ? "compact" : "spacious";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${next} view`}
      aria-pressed={density === "compact"}
      title={
        density === "spacious"
          ? "Spacious view — click for compact"
          : "Compact view — click for spacious"
      }
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      <Icon
        name={density === "spacious" ? "Spacious" : "Compact"}
        className="size-3.5"
      />
    </button>
  );
}

/**
 * A collapsed shelf of parked threads. The header stays while anything is
 * parked — the count is the whole footprint when collapsed — and the shelf
 * vanishes entirely at zero.
 */
function ParkedShelf({
  label,
  threads,
  expanded,
  onToggle,
  shelf,
  activeThreadId,
  lifecycle,
  onNavigate,
  scrollRef,
  layoutKey,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  expanded: boolean;
  onToggle: () => void;
  shelf: "snoozed" | "settled";
  activeThreadId: string | null;
  lifecycle: ReturnType<typeof useLifecycle>;
  onNavigate: () => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  layoutKey: string;
}) {
  if (threads.length === 0) return null;
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 flex w-full items-center gap-2 px-2.5 pb-1 text-left"
      >
        <span className="text-2xs font-medium text-muted-foreground/70">
          {expanded ? label : `${label} (${threads.length})`}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className={TRAILING_GLYPH_BOX_CLASS}>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <ShelfRows
          items={threads}
          rowHeight={ROW_HEIGHT.slim}
          scrollRef={scrollRef}
          layoutKey={layoutKey}
          renderRow={(thread, placement) => (
            <SlimRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              shelf={shelf}
              wakeAt={lifecycle.wakeAtFor(thread)}
              // The exact clock: a wake countdown rounds up, so a clock
              // floored to the minute would show "3h" for a 2h snooze.
              now={Date.now()}
              onNavigate={onNavigate}
              onRestore={() =>
                shelf === "snoozed"
                  ? lifecycle.unsnooze(thread.id)
                  : lifecycle.unsettle(thread.id)
              }
              placement={placement}
            />
          )}
        />
      ) : null}
    </section>
  );
}

function Shelf({
  label,
  children,
}: {
  label: string | null;
  children: React.ReactNode;
}) {
  return (
    <section {...(label ? { "aria-label": label } : {})}>
      {label ? (
        <h2 className={cn("flex items-center gap-2 px-2.5 pb-1 pt-3")}>
          <span className="text-2xs font-medium text-muted-foreground/70">
            {label}
          </span>
          <span className="h-px flex-1 bg-sidebar-border" />
        </h2>
      ) : null}
      {children}
    </section>
  );
}
