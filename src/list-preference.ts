/** Persisted Sidebar Pro list controls (localStorage). */

export const STATUS_FILTERS = [
  "all",
  "needs_you",
  "working",
  "unread",
  "idle",
  "draft",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  needs_you: "Needs you",
  working: "Working",
  unread: "Unread",
  idle: "Idle",
  draft: "Draft",
};

export const SORTS = [
  "created_desc",
  "created_asc",
  "attention_desc",
  "attention_asc",
  "updated_desc",
  "updated_asc",
  "title_asc",
  "title_desc",
] as const;
export type ThreadSort = (typeof SORTS)[number];

export const SORT_LABELS: Record<ThreadSort, string> = {
  created_desc: "Newest created",
  created_asc: "Oldest created",
  attention_desc: "Recent attention",
  attention_asc: "Least recent attention",
  updated_desc: "Recently updated",
  updated_asc: "Least recently updated",
  title_asc: "Title A–Z",
  title_desc: "Title Z–A",
};

export const DENSITIES = ["spacious", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export const ALL_PROVIDERS = "__all__";

/**
 * Legacy sentinel from the single-label filter. Still recognised when loading
 * older localStorage payloads.
 */
export const ALL_LABELS = "__all__";

/** How selected Labels Pro ids are applied in the sidebar list. */
export const LABEL_FILTER_MODES = ["all", "only", "hide"] as const;
export type LabelFilterMode = (typeof LABEL_FILTER_MODES)[number];

export type ListPreference = {
  statusFilter: StatusFilter;
  providerId: string;
  /**
   * `all` — no label filter (ignores {@link labelIds}).
   * `only` — keep threads that carry any of {@link labelIds}.
   * `hide` — drop threads that carry any of {@link labelIds}.
   */
  labelFilterMode: LabelFilterMode;
  /** Labels Pro label ids selected for only/hide. Empty with only/hide → all. */
  labelIds: string[];
  sort: ThreadSort;
  density: Density;
  /** When true, the list shows archived threads instead of the live inbox. */
  showArchived: boolean;
};

export const DEFAULT_PREFERENCE: ListPreference = {
  statusFilter: "all",
  providerId: ALL_PROVIDERS,
  labelFilterMode: "all",
  labelIds: [],
  sort: "created_desc",
  density: "spacious",
  showArchived: false,
};

const STORAGE_KEY = "bb-plugin-sidebar-pro:list-preference:v1";

function isStatusFilter(value: string): value is StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value);
}

function isThreadSort(value: string): value is ThreadSort {
  return (SORTS as readonly string[]).includes(value);
}

function isDensity(value: string): value is Density {
  return (DENSITIES as readonly string[]).includes(value);
}

function isLabelFilterMode(value: string): value is LabelFilterMode {
  return (LABEL_FILTER_MODES as readonly string[]).includes(value);
}

function readLabelIds(record: Record<string, unknown>): string[] {
  if (Array.isArray(record.labelIds)) {
    return record.labelIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  }
  // Migrate single-select `labelId` from SIDE-1/SIDE-4.
  if (
    typeof record.labelId === "string" &&
    record.labelId.length > 0 &&
    record.labelId !== ALL_LABELS
  ) {
    return [record.labelId];
  }
  return [];
}

function readLabelFilterMode(
  record: Record<string, unknown>,
  labelIds: readonly string[],
): LabelFilterMode {
  if (
    typeof record.labelFilterMode === "string" &&
    isLabelFilterMode(record.labelFilterMode)
  ) {
    return record.labelFilterMode;
  }
  if (labelIds.length === 0) return "all";
  // Migrate `labelMode: only|hide` from the single-select era.
  if (record.labelMode === "hide" || record.labelMode === "only") {
    return record.labelMode;
  }
  return "only";
}

export function loadListPreference(): ListPreference {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCE };
  try {
    const storage = window.localStorage;
    if (!storage) return { ...DEFAULT_PREFERENCE };
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const record = JSON.parse(raw) as Record<string, unknown>;
    const labelIds = readLabelIds(record);
    let labelFilterMode = readLabelFilterMode(record, labelIds);
    if (labelFilterMode !== "all" && labelIds.length === 0) {
      labelFilterMode = "all";
    }
    return {
      statusFilter:
        typeof record.statusFilter === "string" &&
        isStatusFilter(record.statusFilter)
          ? record.statusFilter
          : DEFAULT_PREFERENCE.statusFilter,
      providerId:
        typeof record.providerId === "string" && record.providerId.length > 0
          ? record.providerId
          : DEFAULT_PREFERENCE.providerId,
      labelFilterMode,
      labelIds,
      sort:
        typeof record.sort === "string" && isThreadSort(record.sort)
          ? record.sort
          : DEFAULT_PREFERENCE.sort,
      density:
        typeof record.density === "string" && isDensity(record.density)
          ? record.density
          : DEFAULT_PREFERENCE.density,
      showArchived: record.showArchived === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

export function saveListPreference(preference: ListPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Quota / private mode / jsdom without storage — stay in-memory.
  }
}

/** Short trigger text for the label filter control. */
export function labelFilterSummary(
  mode: LabelFilterMode,
  labelIds: readonly string[],
  nameById: ReadonlyMap<string, string>,
): string {
  if (mode === "all" || labelIds.length === 0) return "All labels";
  const names = labelIds
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
  const prefix = mode === "hide" ? "Hide" : "Only";
  if (names.length === 0) return `${prefix} · ${labelIds.length}`;
  if (names.length === 1) return `${prefix} · ${names[0]}`;
  if (names.length === 2) return `${prefix} · ${names[0]}, ${names[1]}`;
  return `${prefix} · ${names.length} labels`;
}
