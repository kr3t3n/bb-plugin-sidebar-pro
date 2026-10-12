/**
 * Labels Pro consumer contract for Sidebar Pro.
 *
 * Mirrors `/home/bb/plugins/bb-plugin-labels-pro/docs/rpc-contract.md` and
 * `src/rpc-contract.ts`. Prefer that tree as source of truth when it drifts.
 */

export const LABELS_PRO_PLUGIN_ID = "labels-pro";

/** Realtime channel Labels Pro publishes on (`LABEL_REALTIME_CHANNEL`). */
export const LABELS_PRO_REALTIME_CHANNEL = "labels";

export type LabelsProLabel = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: number;
  updatedAt: number;
};

/** `listLabels` — every label definition. Input is JSON `null`. */
export type ListLabelsResult = {
  labels: LabelsProLabel[];
};

/** `listThreadsByLabel` — thread ids carrying one label. */
export type ListThreadsByLabelResult = {
  label: LabelsProLabel | null;
  threadIds: string[];
};

/**
 * `listAssignments` — every label and assignment in one call (Labels Pro
 * with the stored revision). With `sinceRevision` equal to the current
 * revision, `changed` is false and the lists are null.
 */
export type ListAssignmentsResult = {
  revision: number;
  changed: boolean;
  labels: LabelsProLabel[] | null;
  assignments: { labelId: string; threadIds: string[] }[] | null;
};

/**
 * Sidebar Pro's own realtime channel for Labels Pro changes. The bb app only
 * delivers a signal to the plugin that published it, so Labels Pro calls our
 * server (`labelsProChanged`), and our server republishes here.
 */
export const SIDEBAR_LABEL_CHANGES_CHANNEL = "labels-pro-changes";

/** What Labels Pro sends to subscribers; see its docs/rpc-contract.md. */
export type LabelChanges = {
  revision: number;
  /** Full current label ids of each changed thread; [] means none left. */
  threads: Record<string, string[]>;
  /** A label itself changed, or the burst was large: reload everything. */
  labelsChanged: boolean;
};
