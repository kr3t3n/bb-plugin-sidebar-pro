import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";
import { ThreadMenuItems } from "./ThreadMenuItems";

/**
 * Stock bb exposes the same thread actions from a "…" button as from
 * right-click. Sidebar Pro keeps that second surface so copy/link (and the
 * rest) are reachable without a context-menu gesture.
 */
export function RowOverflowMenu({
  thread,
  onRename,
  className,
}: {
  thread: PluginSidebarThread;
  onRename: () => void;
  className?: string;
}) {
  const portalScope = usePortalScopeProps();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Thread actions"
          onClick={(event) => {
            // Keep the row's full-bleed open-handler from firing; do not
            // preventDefault or Radix never toggles the menu.
            event.stopPropagation();
          }}
          className={cn(
            "pointer-events-auto rounded p-0.5 text-muted-foreground",
            "opacity-0 hover:text-foreground focus-visible:opacity-100",
            "data-[state=open]:opacity-100 group-hover/card:opacity-100 group-hover/slim:opacity-100",
            className,
          )}
        >
          <Icon name="Ellipsis" className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalScope}
          align="end"
          sideOffset={4}
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ThreadMenuItems
            thread={thread}
            surface="dropdown"
            onRename={onRename}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
