/**
 * Cross-plugin RPC client for Labels Pro.
 *
 * Same-origin POST like Notifications Pro's content-script helper — `useRpc`
 * only talks to *this* plugin's backend.
 */

import {
  LABELS_PRO_PLUGIN_ID,
  type ListAssignmentsResult,
  type ListLabelsResult,
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
        body: JSON.stringify(input ?? {}),
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
  return callLabelsProRpc<ListLabelsResult>("listLabels", {});
}

export function listAssignments(): Promise<ListAssignmentsResult> {
  return callLabelsProRpc<ListAssignmentsResult>("listAssignments", {});
}

/** Build threadId → labelIds for O(1) membership checks in the inbox filter. */
export function assignmentMapFromResult(
  result: ListAssignmentsResult,
): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const row of result.assignments) {
    if (typeof row.threadId !== "string" || row.threadId.length === 0) continue;
    const ids = Array.isArray(row.labelIds)
      ? row.labelIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    map.set(row.threadId, ids);
  }
  return map;
}
