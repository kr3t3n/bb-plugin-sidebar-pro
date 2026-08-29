import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { copyText, threadUrl } from "./thread-link";
import { useLinkOrigins } from "./useLinkOrigins";

export type ThreadMenuSurface = "context" | "dropdown";

/**
 * Shared thread actions for the right-click menu and the row "…" menu.
 * Stock bb uses the same item list on both surfaces; we mirror that here.
 */
export function ThreadMenuItems({
  thread,
  surface,
  onRename,
}: {
  thread: PluginSidebarThread;
  surface: ThreadMenuSurface;
  onRename: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { projects } = useSidebarThreads();
  const project = projects.find((entry) => entry.id === thread.projectId);
  const { localOrigin, cloudOrigin, refresh } = useLinkOrigins();

  const copyId = () => {
    void copyText(thread.id);
  };
  const copyLocal = () => {
    void (async () => {
      const origins = await refresh();
      await copyText(
        threadUrl(thread, project, origins.localOrigin || localOrigin),
      );
    })();
  };
  const copyCloud = () => {
    void (async () => {
      const origins = await refresh();
      const origin = origins.cloudOrigin ?? cloudOrigin;
      if (!origin) return;
      await copyText(threadUrl(thread, project, origin));
    })();
  };

  return (
    <>
      <Item surface={surface} onSelect={() => actions.open(thread.id, { split: true })}>
        Open in split
      </Item>
      <Separator surface={surface} />
      <Item surface={surface} onSelect={copyId}>
        Copy thread ID
      </Item>
      <Item surface={surface} onSelect={copyLocal}>
        Copy local link
      </Item>
      <Item surface={surface} onSelect={copyCloud}>
        Copy cloud link
      </Item>
      <Separator surface={surface} />
      <Item
        surface={surface}
        onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
      >
        {thread.isUnread ? "Mark read" : "Mark unread"}
      </Item>
      <Item
        surface={surface}
        onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
      >
        {thread.isPinned ? "Unpin" : "Pin"}
      </Item>
      <Item
        surface={surface}
        onSelect={() => {
          // Let the menu unmount before focusing the row input, matching
          // stock bb's requestRename deferral.
          window.setTimeout(onRename, 0);
        }}
      >
        Rename
      </Item>
      <Separator surface={surface} />
      <Item surface={surface} onSelect={() => actions.archive(thread.id)}>
        Archive
      </Item>
      <Item
        surface={surface}
        destructive
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </Item>
    </>
  );
}

function Item({
  surface,
  children,
  destructive = false,
  onSelect,
}: {
  surface: ThreadMenuSurface;
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  const className = cn(
    "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
    destructive && "text-destructive-text",
  );
  if (surface === "context") {
    return (
      <ContextMenu.Item onSelect={onSelect} className={className}>
        {children}
      </ContextMenu.Item>
    );
  }
  return (
    <DropdownMenu.Item onSelect={onSelect} className={className}>
      {children}
    </DropdownMenu.Item>
  );
}

function Separator({ surface }: { surface: ThreadMenuSurface }) {
  const className = "my-1 h-px bg-border";
  if (surface === "context") {
    return <ContextMenu.Separator className={className} />;
  }
  return <DropdownMenu.Separator className={className} />;
}
