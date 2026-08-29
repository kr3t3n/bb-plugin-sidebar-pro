import { cn } from "./lib/utils";
import type { LabelsProLabel } from "./labels-pro/contract";

/** Show individual chips up to this count; beyond that, a count + tooltip. */
const CHIP_NAME_LIMIT = 2;

/**
 * Compact label affordance for a thread row. Hidden when the thread has no
 * Labels Pro assignments (or Labels Pro is off and the parent passed []).
 */
export function LabelChips({
  labels,
  compact,
}: {
  labels: readonly LabelsProLabel[];
  compact?: boolean;
}) {
  if (labels.length === 0) return null;

  const title = labels.map((label) => label.name).join(", ");

  if (labels.length > CHIP_NAME_LIMIT) {
    return (
      <span
        title={title}
        aria-label={`Labels: ${title}`}
        className={cn(
          "pointer-events-none relative inline-flex shrink-0 items-center rounded px-1 font-medium text-muted-foreground/80",
          compact ? "text-[10px] leading-4" : "text-2xs leading-4",
        )}
      >
        {labels.length} labels
      </span>
    );
  }

  return (
    <span
      className="pointer-events-none relative inline-flex min-w-0 max-w-[40%] shrink items-center gap-1"
      aria-label={`Labels: ${title}`}
      title={title}
    >
      {labels.map((label) => (
        <span
          key={label.id}
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-1 truncate rounded px-1 font-medium text-muted-foreground/80",
            compact ? "text-[10px] leading-4" : "text-2xs leading-4",
          )}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: label.color?.trim() || "var(--muted-foreground)",
              opacity: label.color?.trim() ? 1 : 0.45,
            }}
          />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
    </span>
  );
}
