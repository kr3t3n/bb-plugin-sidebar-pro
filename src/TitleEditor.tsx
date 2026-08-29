import { useEffect, useRef } from "react";
import { cn } from "./lib/utils";

/**
 * Inline thread-title field. The SDK's `rename` is silent — this is the dialog
 * the host would otherwise own — so Enter/blur commit and Escape cancels.
 */
export function TitleEditor({
  initialTitle,
  className,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  className?: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const commit = () => {
    const next = ref.current?.value.trim() ?? "";
    if (!next || next === initialTitle) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={initialTitle}
      aria-label="Rename thread"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      className={cn(
        "pointer-events-auto relative z-10 w-full min-w-0 rounded border border-border bg-background px-1 py-0 text-foreground outline-none",
        "focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    />
  );
}
