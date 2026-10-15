import { memo, useState } from "react";
import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { RowOverflowMenu } from "./RowOverflowMenu";
import { LabelChips } from "./LabelChips";
import { ProviderGlyph } from "./ProviderGlyph";
import { ThreadUsageLabel } from "./ThreadUsage";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { TitleEditor } from "./TitleEditor";
import { threadDisplayTitle } from "./inbox";
import { resolveSnoozePresets } from "./lifecycle";
import type { LabelsProLabel } from "./labels-pro/contract";
import { placementProps, type RowPlacement } from "./ShelfRows";
import { sameSidebarThread } from "./thread-equality";

type ThreadCardProps = {
  thread: PluginSidebarThread;
  projectName: string | null;
  isActive: boolean;
  /** False while the thread is working or blocked on the user. */
  canPark: boolean;
  density: "spacious" | "compact";
  /** Labels Pro assignments for this thread; empty when Labels Pro is off. */
  labels?: readonly LabelsProLabel[];
  onNavigate: () => void;
  onSettle: (threadId: string) => void;
  onSnooze: (threadId: string, snoozedUntil: number) => void;
  /** Quantized clock, so every card in one render agrees on "now". */
  now: number;
  /** Set when the shelf is virtualised. */
  placement?: RowPlacement;
};

const NO_PLACEMENT: RowPlacement = {};

/**
 * A card redraws only when something it shows changes. The list passes
 * stable callbacks and shared label arrays, so a feed update that touches one
 * thread redraws one card, not the whole list.
 */
function sameCardProps(left: ThreadCardProps, right: ThreadCardProps): boolean {
  return (
    sameSidebarThread(left.thread, right.thread) &&
    left.projectName === right.projectName &&
    left.isActive === right.isActive &&
    left.canPark === right.canPark &&
    left.density === right.density &&
    left.labels === right.labels &&
    left.onNavigate === right.onNavigate &&
    left.onSettle === right.onSettle &&
    left.onSnooze === right.onSnooze &&
    left.now === right.now &&
    left.placement?.top === right.placement?.top &&
    left.placement?.index === right.placement?.index &&
    left.placement?.measureRef === right.placement?.measureRef
  );
}

/**
 * One thread as a three-line card: project and status, title, then branch and
 * activity. The card is the whole point of this sidebar — status lives in the
 * row instead of in its position, which is what lets the list stay still.
 *
 * The row is a positioned container with a full-bleed anchor UNDER the
 * controls, the way bb's own thread row does it: a `<button>` inside an `<a>`
 * is invalid interactive nesting and breaks keyboard behaviour.
 */
export const ThreadCard = memo(function ThreadCard({
  thread,
  projectName,
  isActive,
  canPark,
  density,
  labels = [],
  onNavigate,
  onSettle,
  onSnooze,
  now,
  placement = NO_PLACEMENT,
}: ThreadCardProps) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const compact = density === "compact";
  const [isRenaming, setIsRenaming] = useState(false);
  // The "…" menu mounts when the pointer or focus first reaches the row. Rows
  // that scroll past never pay for it. The right-click menu stays mounted:
  // it wraps the row, and adding it later would remount the row mid-click.
  const [overflowReady, setOverflowReady] = useState(false);
  const readyOverflow = () => setOverflowReady(true);
  const title = threadDisplayTitle(thread);

  const finishRename = (next: string) => {
    setIsRenaming(false);
    void actions.rename(thread.id, next);
  };

  return (
    <RowContextMenu thread={thread} onRename={() => setIsRenaming(true)}>
      <li
        className="list-none"
        {...placementProps(placement)}
        onPointerEnter={readyOverflow}
        onFocus={readyOverflow}
      >
        <div
          className={cn(
            "group/card relative rounded-md px-2.5 transition-colors",
            compact ? "py-1.5" : "py-2",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            // A thread open in another pane gets a weaker tint than the active
            // row, so the two states stay distinguishable.
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
        >
          <a
            // Both attributes, or bb's nine thread shortcuts stop finding rows.
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={title}
            {...splitProps}
            onClick={(event) => {
              event.preventDefault();
              if (isRenaming) return;
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className={cn(
              "absolute inset-0 cursor-pointer rounded-md",
              isRenaming && "pointer-events-none",
            )}
          />
          {compact ? (
            <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
              {isRenaming ? (
                <TitleEditor
                  initialTitle={title}
                  className="h-5 flex-1 text-sm"
                  onCommit={finishRename}
                  onCancel={() => setIsRenaming(false)}
                />
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm text-foreground",
                    thread.isUnread && "font-medium",
                  )}
                >
                  {title}
                </span>
              )}
              <ThreadUsageLabel thread={thread} />
              <LabelChips labels={labels} compact />
              <span className="pointer-events-auto relative flex items-center gap-0.5">
                {canPark ? (
                  <span className="hidden items-center gap-0.5 group-hover/card:flex">
                    <ParkButton
                      label="Snooze until tomorrow"
                      icon="Clock"
                      onActivate={() =>
                        onSnooze(
                          thread.id,
                          resolveSnoozePresets(new Date())[2]!.snoozedUntil,
                        )
                      }
                    />
                    <ParkButton
                      label="Settle thread"
                      icon="Check"
                      onActivate={() => onSettle(thread.id)}
                    />
                  </span>
                ) : null}
                {overflowReady ? (
                  <RowOverflowMenu
                    thread={thread}
                    onRename={() => setIsRenaming(true)}
                  />
                ) : (
                  <OverflowPlaceholder onActivate={readyOverflow} />
                )}
              </span>
              <span
                className={cn(
                  STATUS_SLOT_CLASS,
                  canPark && "group-hover/card:hidden",
                )}
              >
                <StatusOrTime thread={thread} now={now} />
              </span>
              <ProviderGlyph providerId={thread.providerId} />
            </div>
          ) : (
            <>
              <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
                  {projectName ?? " "}
                </span>
                {/* Status at rest, park/overflow on hover. Only the status yields,
                    so the project name never shifts. */}
                <span className="pointer-events-auto relative flex items-center gap-0.5">
                  {canPark ? (
                    <span className="hidden items-center gap-0.5 group-hover/card:flex">
                      <ParkButton
                        label="Snooze until tomorrow"
                        icon="Clock"
                        onActivate={() =>
                          onSnooze(
                            thread.id,
                            resolveSnoozePresets(new Date())[2]!.snoozedUntil,
                          )
                        }
                      />
                      <ParkButton
                        label="Settle thread"
                        icon="Check"
                        onActivate={() => onSettle(thread.id)}
                      />
                    </span>
                  ) : null}
                  {overflowReady ? (
                    <RowOverflowMenu
                      thread={thread}
                      onRename={() => setIsRenaming(true)}
                    />
                  ) : (
                    <OverflowPlaceholder onActivate={readyOverflow} />
                  )}
                </span>
                <span
                  className={cn(
                    STATUS_SLOT_CLASS,
                    canPark && "group-hover/card:hidden",
                  )}
                >
                  <StatusOrTime thread={thread} now={now} />
                </span>
              </div>
              <div
                className={cn(
                  // Weight alone carries unread. Fading the title — or the whole
                  // card — makes a thread at rest read as disabled, and at rest is
                  // what most of the list is most of the time.
                  "pointer-events-none relative mt-0.5 flex items-center gap-1.5 text-sm text-foreground",
                  thread.isUnread && "font-medium",
                )}
              >
                {isRenaming ? (
                  <TitleEditor
                    initialTitle={title}
                    className="h-5 min-w-0 flex-1 text-sm"
                    onCommit={finishRename}
                    onCancel={() => setIsRenaming(false)}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                )}
                <ThreadUsageLabel thread={thread} />
              </div>
              <div className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground">
                {/* A thread without a worktree still runs somewhere, so the
                    machine takes the branch's place rather than leaving the line
                    blank. */}
                {thread.environment?.branchName ? (
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {thread.environment.branchName}
                  </span>
                ) : thread.host ? (
                  <span className="min-w-0 flex-1 truncate">
                    {thread.host.name}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <LabelChips labels={labels} />
                {thread.activity.workflows > 0 ? (
                  <ActivityCount
                    label="workflows"
                    count={thread.activity.workflows}
                  />
                ) : null}
                {thread.activity.backgroundAgents > 0 ? (
                  <ActivityCount
                    label="background agents"
                    count={thread.activity.backgroundAgents}
                  />
                ) : null}
                <PullRequestLink threadId={thread.id} />
                {/* Always drawn, so the line has a fixed right edge. */}
                <ProviderGlyph providerId={thread.providerId} />
              </div>
            </>
          )}
        </div>
      </li>
    </RowContextMenu>
  );
}, sameCardProps);

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Clock" | "Check">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}

/**
 * The pull request for the thread's branch. It costs a git-host lookup
 * (threads sharing a worktree share one), and only the spacious card shows
 * it, so the lookup lives here and compact rows never start it.
 */
function PullRequestLink({ threadId }: { threadId: string }) {
  const { pullRequest } = useSidebarThreadPullRequest(threadId);
  if (!pullRequest) return null;
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={pullRequest.title}
      className={cn(
        "relative shrink-0 font-mono hover:underline",
        pullRequest.state === "merged"
          ? "text-[color:var(--pr-merged)]"
          : pullRequest.attention === "checks_failed" ||
              pullRequest.attention === "conflicts"
            ? "text-destructive-text"
            : pullRequest.attention === "ready_to_merge"
              ? "text-success-foreground"
              : "text-muted-foreground",
      )}
    >
      #{pullRequest.number}
    </a>
  );
}

/**
 * Looks like the "…" button before its menu mounts. Hover or focus on the
 * row replaces it first; a tap that lands here mounts the menu for the next
 * tap.
 */
function OverflowPlaceholder({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      aria-label="Thread actions"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      className={cn(
        "pointer-events-auto rounded p-0.5 text-muted-foreground",
        "opacity-0 hover:text-foreground focus-visible:opacity-100",
        "group-hover/card:opacity-100",
      )}
    >
      <Icon name="Ellipsis" className="size-3.5" />
    </button>
  );
}
