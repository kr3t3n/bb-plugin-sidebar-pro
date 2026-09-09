import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./components/Icon";
import { usePortalScopeProps } from "./lib/portal-scope";
import { SEARCH_SLOT_ATTR, setNewThreadSearchOpen } from "./search-slot";

function useSearchSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const read = () =>
      document.querySelector<HTMLElement>(`[${SEARCH_SLOT_ATTR}]`);
    setSlot(read());
    const observer = new MutationObserver(() => setSlot(read()));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);
  return slot;
}

export function ThreadSearch({
  query,
  onQueryChange,
  open,
  onOpenChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const slot = useSearchSlot();
  const portalScope = usePortalScopeProps();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNewThreadSearchOpen(open);
    return () => setNewThreadSearchOpen(false);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    onQueryChange("");
    onOpenChange(false);
  };

  const body = (
    <div
      {...portalScope}
      className={
        open
          ? "flex min-w-0 flex-1 items-center gap-0.5"
          : "flex shrink-0 items-center"
      }
    >
      {open ? (
        <>
          <span className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <Icon name="Search" className="size-3.5" aria-hidden />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
            role="combobox"
            aria-label="Search threads"
            aria-expanded="true"
            placeholder="Search threads"
            className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            aria-label={query.trim() ? "Clear and close search" : "Close search"}
            onClick={close}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Icon name="CircleX" className="size-3.5" aria-hidden />
          </button>
        </>
      ) : (
        <button
          type="button"
          aria-label="Search threads"
          onClick={() => onOpenChange(true)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Icon name="Search" className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );

  if (slot !== null) return createPortal(body, slot);
  return body;
}
