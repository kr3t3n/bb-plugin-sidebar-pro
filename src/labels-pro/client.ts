/**
 * Cross-plugin RPC client for Labels Pro.
 *
 * Same-origin POST like Notifications Pro's content-script helper — `useRpc`
 * only talks to *this* plugin's backend. Wire methods match
 * `bb-plugin-labels-pro/docs/rpc-contract.md`.
 */

import {
  LABELS_PRO_PLUGIN_ID,
  type LabelChanges,
  type LabelsProLabel,
  type ListAssignmentsResult,
  type ListLabelsResult,
  type ListThreadsByLabelResult,
} from "./contract";

export class LabelsProUnavailableError extends Error {
  /** `unknown_method`: Labels Pro runs, but is an older build. */
  readonly code: "unavailable" | "http" | "rpc" | "unknown_method";

  constructor(message: string, code: LabelsProUnavailableError["code"]) {
    super(message);
    this.name = "LabelsProUnavailableError";
    this.code = code;
  }
}

type RpcEnvelope<T> = {
  ok?: boolean;
  result?: T;
  error?: { message?: string; code?: string };
};

async function callLabelsProRpc<T>(method: string, input: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `/api/v1/plugins/${LABELS_PRO_PLUGIN_ID}/rpc/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Labels Pro uses `z.null()` for listLabels — do not coerce to {}.
        body: JSON.stringify(input),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "labels-pro rpc network error";
    throw new LabelsProUnavailableError(message, "unavailable");
  }

  // Missing / disabled plugin typically 404s; treat as graceful absence. An
  // older Labels Pro also answers 404, with code `unknown_method`.
  if (response.status === 404) {
    const body = (await response
      .json()
      .catch(() => null)) as RpcEnvelope<T> | null;
    const code =
      body && typeof body.error === "object" ? body.error?.code : undefined;
    throw new LabelsProUnavailableError(
      `labels-pro ${method} unavailable (404)`,
      code === "unknown_method" ? "unknown_method" : "unavailable",
    );
  }
  if (response.status === 503) {
    throw new LabelsProUnavailableError(
      `labels-pro ${method} unavailable (${response.status})`,
      "unavailable",
    );
  }

  let data: RpcEnvelope<T>;
  try {
    data = (await response.json()) as RpcEnvelope<T>;
  } catch {
    throw new LabelsProUnavailableError(
      `labels-pro ${method} returned non-JSON`,
      "http",
    );
  }

  if (!response.ok || data.ok !== true) {
    const message = data.error?.message ?? `labels-pro rpc ${method} failed`;
    const code =
      response.status >= 500 || data.error?.code === "unavailable"
        ? "unavailable"
        : "rpc";
    throw new LabelsProUnavailableError(message, code);
  }

  return data.result as T;
}

export function listLabels(): Promise<ListLabelsResult> {
  return callLabelsProRpc<ListLabelsResult>("listLabels", null);
}

export function listThreadsByLabel(
  labelId: string,
): Promise<ListThreadsByLabelResult> {
  return callLabelsProRpc<ListThreadsByLabelResult>("listThreadsByLabel", {
    labelId,
  });
}

function isLabel(value: unknown): value is LabelsProLabel {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.name === "string" &&
    typeof row.slug === "string"
  );
}

/**
 * Load definitions plus an inverted thread→labelIds map by walking
 * `listThreadsByLabel` for each label (no bulk assignments RPC on the wire).
 */
export async function loadLabelsSnapshot(): Promise<{
  labels: LabelsProLabel[];
  labelIdsByThreadId: Map<string, readonly string[]>;
}> {
  const { labels: raw } = await listLabels();
  const labels = (Array.isArray(raw) ? raw : []).filter(isLabel);

  const mutable = new Map<string, string[]>();
  await Promise.all(
    labels.map(async (label) => {
      const { threadIds } = await listThreadsByLabel(label.id);
      for (const threadId of threadIds) {
        if (typeof threadId !== "string" || threadId.length === 0) continue;
        const existing = mutable.get(threadId);
        if (existing) existing.push(label.id);
        else mutable.set(threadId, [label.id]);
      }
    }),
  );

  // The label calls finish in any order. Sort each thread's ids by label
  // order, so chips keep their places from one refresh to the next.
  const order = new Map(labels.map((label, index) => [label.id, index]));
  const labelIdsByThreadId = new Map<string, readonly string[]>();
  for (const [threadId, ids] of mutable) {
    labelIdsByThreadId.set(
      threadId,
      ids.sort((left, right) => order.get(left)! - order.get(right)!),
    );
  }
  return { labels, labelIdsByThreadId };
}

/** Resolve label DTOs for one thread from a ready snapshot. */
export function labelsForThread(
  threadId: string,
  labels: readonly LabelsProLabel[],
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]>,
): LabelsProLabel[] {
  const ids = labelIdsByThreadId.get(threadId) ?? [];
  if (ids.length === 0) return [];
  const byId = new Map(labels.map((label) => [label.id, label]));
  const resolved: LabelsProLabel[] = [];
  for (const id of ids) {
    const label = byId.get(id);
    if (label) resolved.push(label);
  }
  return resolved;
}

const NO_LABELS: readonly LabelsProLabel[] = [];

/**
 * Label DTOs for every labelled thread, built once per snapshot. Rows read
 * their array from here, so an unchanged thread gets the same array on every
 * render and its card can skip the redraw.
 */
export function labelsByThreadId(
  labels: readonly LabelsProLabel[],
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly LabelsProLabel[]> {
  const byId = new Map(labels.map((label) => [label.id, label]));
  const result = new Map<string, readonly LabelsProLabel[]>();
  for (const [threadId, ids] of labelIdsByThreadId) {
    const resolved = ids.flatMap((id) => byId.get(id) ?? []);
    if (resolved.length > 0) result.set(threadId, resolved);
  }
  return result;
}

export function labelsFor(
  threadId: string,
  byThread: ReadonlyMap<string, readonly LabelsProLabel[]> | null,
): readonly LabelsProLabel[] {
  return byThread?.get(threadId) ?? NO_LABELS;
}

/**
 * A stable text form of a snapshot, for "did anything change" checks. Label
 * calls finish in any order, so ids are sorted before they are compared.
 */
export function snapshotSignature(snapshot: {
  labels: readonly LabelsProLabel[];
  labelIdsByThreadId: ReadonlyMap<string, readonly string[]>;
}): string {
  const labels = [...snapshot.labels]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((label) => JSON.stringify(label));
  const assignments = [...snapshot.labelIdsByThreadId]
    .map(([threadId, ids]) => `${threadId}:${[...ids].sort().join(",")}`)
    .sort();
  return `${labels.join("\n")}\n--\n${assignments.join("\n")}`;
}

export function listAssignments(
  sinceRevision: number | null,
): Promise<ListAssignmentsResult> {
  return callLabelsProRpc<ListAssignmentsResult>(
    "listAssignments",
    sinceRevision === null ? {} : { sinceRevision },
  );
}

/** Sort each thread's label ids by label order, so chips keep their places. */
function sortByLabelOrder(
  ids: readonly string[],
  order: ReadonlyMap<string, number>,
): string[] {
  return [...ids].sort(
    (left, right) =>
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Invert `listAssignments` groups into threadId → label ids. */
export function assignmentsToMap(
  labels: readonly LabelsProLabel[],
  assignments: readonly { labelId: string; threadIds: readonly string[] }[],
): Map<string, readonly string[]> {
  const order = new Map(labels.map((label, index) => [label.id, index]));
  const byThread = new Map<string, string[]>();
  for (const { labelId, threadIds } of assignments) {
    if (!order.has(labelId)) continue;
    for (const threadId of threadIds) {
      const ids = byThread.get(threadId);
      if (ids) ids.push(labelId);
      else byThread.set(threadId, [labelId]);
    }
  }
  const result = new Map<string, readonly string[]>();
  for (const [threadId, ids] of byThread) {
    result.set(threadId, sortByLabelOrder(ids, order));
  }
  return result;
}

/**
 * Apply a Labels Pro change message to the current map. Each entry is the
 * thread's full current state, so the order messages arrive in does not
 * matter. Returns the same map when nothing differs, so the list does not
 * redraw.
 */
export function applyLabelChanges(
  labels: readonly LabelsProLabel[],
  current: ReadonlyMap<string, readonly string[]>,
  threads: LabelChanges["threads"],
): ReadonlyMap<string, readonly string[]> {
  const order = new Map(labels.map((label, index) => [label.id, index]));
  let next: Map<string, readonly string[]> | null = null;
  for (const [threadId, rawIds] of Object.entries(threads)) {
    const ids = sortByLabelOrder(
      rawIds.filter((id) => order.has(id)),
      order,
    );
    const before = current.get(threadId) ?? [];
    if (
      before.length === ids.length &&
      before.every((id, index) => id === ids[index])
    ) {
      continue;
    }
    next ??= new Map(current);
    if (ids.length === 0) next.delete(threadId);
    else next.set(threadId, ids);
  }
  return next ?? current;
}
