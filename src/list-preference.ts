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

/** Sentinel for "no label filter" — same shape as {@link ALL_PROVIDERS}. */
export const ALL_LABELS = "__all__";

export type ListPreference = {
  statusFilter: StatusFilter;
  providerId: string;
  /**
   * Labels Pro label id, or {@link ALL_LABELS}. Ignored when Labels Pro is
   * unavailable; still persisted so the choice returns with the plugin.
   */
  labelId: string;
  sort: ThreadSort;
  density: Density;
};

export const DEFAULT_PREFERENCE: ListPreference = {
  statusFilter: "all",
  providerId: ALL_PROVIDERS,
  labelId: ALL_LABELS,
  sort: "created_desc",
  density: "spacious",
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

export function loadListPreference(): ListPreference {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCE };
  try {
    const storage = window.localStorage;
    if (!storage) return { ...DEFAULT_PREFERENCE };
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const record = JSON.parse(raw) as Record<string, unknown>;
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
      labelId:
        typeof record.labelId === "string" && record.labelId.length > 0
          ? record.labelId
          : DEFAULT_PREFERENCE.labelId,
      sort:
        typeof record.sort === "string" && isThreadSort(record.sort)
          ? record.sort
          : DEFAULT_PREFERENCE.sort,
      density:
        typeof record.density === "string" && isDensity(record.density)
          ? record.density
          : DEFAULT_PREFERENCE.density,
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
