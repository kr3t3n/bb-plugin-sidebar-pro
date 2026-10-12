import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import {
  LabelsProUnavailableError,
  applyLabelChanges,
  assignmentsToMap,
  listAssignments,
  loadLabelsSnapshot,
  snapshotSignature,
} from "./client";
import {
  SIDEBAR_LABEL_CHANGES_CHANNEL,
  type LabelChanges,
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

/** Only for an older Labels Pro that has no bulk read or change calls. */
const LEGACY_POLL_MS = 30_000;

type Mode = "unknown" | "bulk" | "legacy";

/**
 * Subscribe to Labels Pro definitions + assignment map for the sidebar join.
 * When the plugin is missing/disabled, status stays `unavailable` and callers
 * hide the filter / chips.
 *
 * Current Labels Pro: one bulk read, then change messages that our server
 * relays on our own channel. No timer: the map reloads only when the realtime
 * connection comes back or the tab becomes visible again, with the last
 * revision, so an unchanged store answers with no data. An older Labels Pro
 * falls back to one call per label every 30 seconds.
 */
export function useLabelsPro(): LabelsProState {
  const [state, setState] = useState<LabelsProState>({ status: "loading" });
  const [mode, setMode] = useState<Mode>("unknown");
  const connection = useRealtimeConnectionState();
  const inFlight = useRef(false);
  // A refresh asked for while one runs must not be lost: the running fetch
  // may have read the store before the change it was asked about.
  const rerun = useRef(false);
  const lastSignature = useRef<string | null>(null);
  const revision = useRef<number | null>(null);
  const modeRef = useRef<Mode>("unknown");

  const setModeBoth = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
  };

  const loadOnce = async () => {
    if (modeRef.current !== "legacy") {
      try {
        const result = await listAssignments(revision.current);
        setModeBoth("bulk");
        // A change message may have moved us past this reply already.
        if (!result.changed || (revision.current ?? -1) > result.revision) {
          return;
        }
        revision.current = result.revision;
        const labels = result.labels ?? [];
        setState({
          status: "ready",
          labels,
          labelIdsByThreadId: assignmentsToMap(
            labels,
            result.assignments ?? [],
          ),
        });
        return;
      } catch (error) {
        // An older Labels Pro answers 404 for the bulk call (code
        // unknown_method), and so does a missing one. Only the per-label
        // calls below can tell them apart.
        const notFound =
          error instanceof LabelsProUnavailableError &&
          (error.code === "unknown_method" || error.code === "unavailable");
        if (!notFound) throw error;
      }
    }
    const snapshot = await loadLabelsSnapshot();
    if (modeRef.current !== "legacy") setModeBoth("legacy");
    // Every poll used to produce a new map, which re-ran the filters and
    // redrew every row. Keep the current state when the content is the same.
    const signature = snapshotSignature(snapshot);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    setState({
      status: "ready",
      labels: snapshot.labels,
      labelIdsByThreadId: snapshot.labelIdsByThreadId,
    });
  };

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
          await loadOnce();
        } catch (error) {
          if (
            error instanceof LabelsProUnavailableError &&
            error.code === "unavailable"
          ) {
            lastSignature.current = null;
            revision.current = null;
            setModeBoth("unknown");
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
    // loadOnce reads refs only; the callback must stay stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (mode !== "legacy") return;
    const timer = setInterval(() => void refresh(), LEGACY_POLL_MS);
    return () => clearInterval(timer);
  }, [mode, refresh]);

  useRealtime(SIDEBAR_LABEL_CHANGES_CHANNEL, (payload) => {
    const changes = payload as LabelChanges;
    // No full load yet (or an older Labels Pro): load instead of patching,
    // so this message cannot make the first load look out of date.
    if (changes.labelsChanged || revision.current === null) {
      void refresh();
      return;
    }
    if (changes.revision <= revision.current) return;
    setState((current) => {
      if (current.status !== "ready") return current;
      const next = applyLabelChanges(
        current.labels,
        current.labelIdsByThreadId,
        changes.threads,
      );
      return next === current.labelIdsByThreadId
        ? current
        : { ...current, labelIdsByThreadId: next };
    });
    revision.current = changes.revision;
  });

  // Signals sent while disconnected are lost. Reconcile when the connection
  // returns or the tab comes back; with the last revision this costs one
  // small reply when nothing changed.
  // Only a return after a drop counts: the first connection is not a
  // reconnection, and the mount already loaded.
  const connectedOnce = useRef(false);
  const dropped = useRef(false);
  useEffect(() => {
    if (connection === "connected") {
      if (connectedOnce.current && dropped.current) void refresh();
      connectedOnce.current = true;
      dropped.current = false;
    } else if (connectedOnce.current) {
      dropped.current = true;
    }
  }, [connection, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return state;
}
