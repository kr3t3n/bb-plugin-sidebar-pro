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
