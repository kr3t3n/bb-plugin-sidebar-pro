import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import {
  LabelsProUnavailableError,
  loadLabelsSnapshot,
  snapshotSignature,
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
 * hide the filter / chips.
 */
export function useLabelsPro(): LabelsProState {
  const [state, setState] = useState<LabelsProState>({ status: "loading" });
  const connection = useRealtimeConnectionState();
  const inFlight = useRef(false);
  // A refresh asked for while one runs must not be lost: the running fetch
  // may have read the store before the change it was asked about.
  const rerun = useRef(false);
  const lastSignature = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      rerun.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        rerun.current = false;
        try {
          const snapshot = await loadLabelsSnapshot();
          // Every poll used to produce a new map, which re-ran the filters
          // and redrew every row. Keep the current state when the content
          // is the same.
          const signature = snapshotSignature(snapshot);
          if (signature === lastSignature.current) continue;
          lastSignature.current = signature;
          setState({
            status: "ready",
            labels: snapshot.labels,
            labelIdsByThreadId: snapshot.labelIdsByThreadId,
          });
        } catch (error) {
          if (
            error instanceof LabelsProUnavailableError &&
            error.code === "unavailable"
          ) {
            lastSignature.current = null;
            setState({ status: "unavailable" });
            continue;
          }
          // Transient RPC/parse errors: keep prior ready data if any;
          // otherwise treat as unavailable so the filter stays hidden rather
          // than stuck.
          setState((current) =>
            current.status === "ready" ? current : { status: "unavailable" },
          );
        }
      } while (rerun.current);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Labels Pro publishes on this channel. If the host scopes realtime
  // per-plugin, the poll above still keeps the map fresh.
  useRealtime(LABELS_PRO_REALTIME_CHANNEL, () => {
    void refresh();
  });

  useEffect(() => {
    if (connection === "connected") void refresh();
  }, [connection, refresh]);

  return state;
}
