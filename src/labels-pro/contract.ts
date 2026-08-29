/**
 * Temporary Labels Pro consumer contract for Sidebar Pro (SIDE-1).
 *
 * Labels Pro (LABL-3 / LABL-7) owns the canonical `docs/rpc-contract.md`.
 * Keep this file aligned when that lands; do not invent a second wire shape.
 *
 * Plugin id is the package slug without the `bb-plugin-` prefix, matching
 * `sidebar-pro` / `notifications-pro`.
 */

export const LABELS_PRO_PLUGIN_ID = "labels-pro";

/** Realtime channel Labels Pro should publish assignment/definition changes on. */
export const LABELS_PRO_REALTIME_CHANNEL = "labels";

export type LabelsProLabel = {
  id: string;
  name: string;
  /** Optional CSS color / token; Sidebar Pro may ignore for the filter picker. */
  color: string | null;
};

export type LabelsProAssignment = {
  threadId: string;
  labelIds: string[];
};

/** `listLabels` — every label definition, sorted by the server. */
export type ListLabelsResult = {
  labels: LabelsProLabel[];
};

/**
 * `listAssignments` — full thread↔label map for joining with the sidebar list.
 * Prefer one bulk call over N per-thread RPCs.
 */
export type ListAssignmentsResult = {
  assignments: LabelsProAssignment[];
};

/** Wire methods Sidebar Pro calls today. Expand when LABL-7 documents more. */
export type LabelsProConsumerMethods = {
  listLabels: { input: Record<string, never>; output: ListLabelsResult };
  listAssignments: {
    input: Record<string, never>;
    output: ListAssignmentsResult;
  };
};
