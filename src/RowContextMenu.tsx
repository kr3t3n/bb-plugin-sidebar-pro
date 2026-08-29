import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadMenuItems } from "./ThreadMenuItems";

/**
 * This sidebar's own right-click menu.
 *
 * The plugin API ships no menu component on purpose, so a replaced sidebar
 * owns this surface. Items live in {@link ThreadMenuItems} so the row "…"
 * dropdown stays in lockstep.
 */
export function RowContextMenu({
  thread,
  onRename,
  children,
}: {
  thread: PluginSidebarThread;
  /** Starts the row's own inline title editor (SDK rename is silent). */
  onRename: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ThreadMenuItems
            thread={thread}
            surface="context"
            onRename={onRename}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
