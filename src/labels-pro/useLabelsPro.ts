import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import {
  assignmentMapFromResult,
  LabelsProUnavailableError,
  listAssignments,
  listLabels,
} from "./client";
import {
  LABELS_PRO_REALTIME_CHANNEL,
  type LabelsProLabel,
} from "./contract";

export type LabelsProState =
  | { status: "loading" | "unavailable" }
  | {
      status: "ready";
      labels: readonly LabelsProLabel[];
      /** threadId → label ids assigned to that thread. */
      labelIdsByThreadId: ReadonlyMap<string, readonly string[]>;
    };

const POLL_MS = 30_000;

/**
 * Subscribe to Labels Pro definitions + assignment map for the sidebar join.
 * When the plugin is missing/disabled, status stays `unavailable` and callers
 * hide the filter.
 */
export function useLabelsPro(): LabelsProState {
  const [state, setState] = useState<LabelsProState>({ status: "loading" });
  const connection = useRealtimeConnectionState();
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [labelsResult, assignmentsResult] = await Promise.all([
        listLabels(),
        listAssignments(),
      ]);
      const labels = Array.isArray(labelsResult.labels)
        ? labelsResult.labels.filter(
            (label): label is LabelsProLabel =>
              typeof label?.id === "string" &&
              label.id.length > 0 &&
              typeof label?.name === "string",
          )
        : [];
      setState({
        status: "ready",
        labels,
        labelIdsByThreadId: assignmentMapFromResult(assignmentsResult),
      });
    } catch (error) {
      if (
        error instanceof LabelsProUnavailableError &&
        error.code === "unavailable"
      ) {
        setState({ status: "unavailable" });
        return;
      }
      // Transient RPC/parse errors: keep prior ready data if any; otherwise
      // treat as unavailable so the filter stays hidden rather than stuck.
      setState((current) =>
        current.status === "ready" ? current : { status: "unavailable" },
      );
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Labels Pro publishes on this channel (LABL-3). If the host scopes realtime
  // per-plugin, the poll above still keeps the map fresh.
  useRealtime(LABELS_PRO_REALTIME_CHANNEL, () => {
    void refresh();
  });

  useEffect(() => {
    if (connection === "connected") void refresh();
  }, [connection, refresh]);

  return state;
}
