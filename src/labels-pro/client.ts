/**
 * Cross-plugin RPC client for Labels Pro.
 *
 * Same-origin POST like Notifications Pro's content-script helper — `useRpc`
 * only talks to *this* plugin's backend. Wire methods match
 * `bb-plugin-labels-pro/docs/rpc-contract.md`.
 */

import {
  LABELS_PRO_PLUGIN_ID,
  type LabelsProLabel,
  type ListLabelsResult,
  type ListThreadsByLabelResult,
} from "./contract";

export class LabelsProUnavailableError extends Error {
  readonly code: "unavailable" | "http" | "rpc";

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

  // Missing / disabled plugin typically 404s; treat as graceful absence.
  if (response.status === 404 || response.status === 503) {
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

  const labelIdsByThreadId = new Map<string, readonly string[]>();
  for (const [threadId, ids] of mutable) {
    labelIdsByThreadId.set(threadId, ids);
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
