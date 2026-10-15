import {
  createContext, useContext, useEffect, useId, useRef, useState, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { parseThreadUsage, threadUsageLimit, type ThreadUsage } from "./thread-usage";

const UsageContext = createContext<ReadonlyMap<string, ThreadUsage>>(new Map());

export function ThreadUsageProvider({
  threads, children,
}: {
  threads: readonly PluginSidebarThread[];
  children: ReactNode;
}) {
  const hostKey = JSON.stringify([...new Set(threads.flatMap((thread) =>
    thread.host ? [thread.host.id] : [],
  ))].sort());
  const [usage, setUsage] = useState<ReadonlyMap<string, ThreadUsage>>(new Map());
  useEffect(() => {
    const hostIds: string[] = JSON.parse(hostKey);
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted || document.visibilityState === "hidden") return;
      pending = true;
      const next = new Map<string, ThreadUsage>();
      try {
        await Promise.all(hostIds.map(async (hostId) => {
          try {
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
            const response = await fetch(
              `/api/v1/system/usage-limits?${new URLSearchParams({ hostId })}`,
              { signal, credentials: "same-origin" },
            );
            if (!response.ok) return;
            const value = parseThreadUsage(await response.json());
            if (value !== null) next.set(hostId, value);
          } catch {
            return;
          }
        }));
        if (!controller.signal.aborted) setUsage(next);
      } finally {
        pending = false;
      }
    };
    setUsage(new Map());
    void refresh();
    const poll = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => void refresh();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearInterval(poll);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hostKey]);
  return <UsageContext.Provider value={usage}>{children}</UsageContext.Provider>;
}

export function ThreadUsageBadge({ thread }: { thread: PluginSidebarThread }) {
  const usage = useContext(UsageContext);
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  const limit = threadUsageLimit(thread.host ? usage.get(thread.host.id) : undefined, thread.providerId, now);
  const reset = limit?.resetsAt;
  useEffect(() => {
    setNow(Date.now());
    if (reset == null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(1, reset - Date.now())));
    return () => window.clearTimeout(timer);
  }, [reset, usage]);
  useEffect(() => {
    if (anchor === null) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !buttonRef.current?.contains(event.target)) setAnchor(null);
    };
    const dismissOnMove = () => setAnchor(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", dismissOnMove, true);
    window.addEventListener("resize", dismissOnMove);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", dismissOnMove, true);
      window.removeEventListener("resize", dismissOnMove);
    };
  }, [anchor]);
  if (limit === null) return null;
  const showDetails = () => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (bounds) setAnchor({ left: Math.max(8, Math.min(bounds.left, window.innerWidth - 288)), top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - 120)) });
  };
  return (
    <>
    <button
      ref={buttonRef}
      type="button"
      data-thread-usage-limit=""
      data-provider-usage-badge=""
      className="pointer-events-auto relative inline-flex h-4 w-3 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-amber-500 dark:text-amber-300"
      aria-label={limit.detail}
      aria-describedby={anchor === null ? undefined : tooltipId}
      onPointerEnter={showDetails}
      onPointerLeave={() => setAnchor(null)}
      onFocus={showDetails}
      onBlur={() => setAnchor(null)}
      onClick={(event) => { event.stopPropagation(); showDetails(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setAnchor(null); } }}
    >
      <svg aria-hidden="true" viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-2 w-1.5">
        <path d="M3 2h10M3 18h10M4 2v4c0 2 2 3 4 4-2 1-4 2-4 4v4M12 2v4c0 2-2 3-4 4 2 1 4 2 4 4v4" />
      </svg>
    </button>
    {anchor !== null && createPortal(
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none fixed z-50 max-w-72 rounded-md border border-border bg-popover px-3 py-2 text-xs font-normal text-popover-foreground shadow-md"
        style={anchor}
      >
        {limit.detail}
      </span>,
      document.body,
    )}
    </>
  );
}
