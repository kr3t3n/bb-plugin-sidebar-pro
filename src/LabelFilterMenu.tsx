import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";
import type { LabelsProLabel } from "./labels-pro/contract";
import {
  labelFilterSummary,
  type LabelFilterMode,
} from "./list-preference";

/**
 * Multi-select Labels Pro filter: All / Only checked / Hide checked, plus a
 * checkbox per label so several can be hidden or required at once.
 */
export function LabelFilterMenu({
  labels,
  mode,
  selectedIds,
  onChange,
}: {
  labels: readonly LabelsProLabel[];
  mode: LabelFilterMode;
  selectedIds: readonly string[];
  onChange: (mode: LabelFilterMode, labelIds: string[]) => void;
}) {
  const portalScope = usePortalScopeProps();
  const selected = new Set(selectedIds);
  const nameById = new Map(labels.map((label) => [label.id, label.name]));
  const summary = labelFilterSummary(mode, selectedIds, nameById);
  const active = mode !== "all" && selectedIds.length > 0;

  const setMode = (next: LabelFilterMode) => {
    if (next === "all") {
      onChange("all", []);
      return;
    }
    onChange(next, [...selectedIds]);
  };

  const toggleId = (labelId: string, checked: boolean) => {
    const nextIds = checked
      ? selectedIds.includes(labelId)
        ? [...selectedIds]
        : [...selectedIds, labelId]
      : selectedIds.filter((id) => id !== labelId);
    if (nextIds.length === 0) {
      onChange("all", []);
      return;
    }
    // Checking the first label from All defaults to Hide — the usual ask.
    const nextMode = mode === "all" ? "hide" : mode;
    onChange(nextMode, nextIds);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Label filter: ${summary}`}
          title={summary}
          className={
            active
              ? "inline-flex h-7 min-w-0 flex-1 items-center gap-1 truncate rounded-md bg-sidebar-accent px-1.5 py-1 text-xs font-medium text-foreground"
              : "inline-flex h-7 min-w-0 flex-1 items-center gap-1 truncate rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          }
        >
          <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
          <Icon name="ChevronDown" className="size-3 shrink-0 opacity-70" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalScope}
          align="start"
          sideOffset={4}
          aria-label="Label filter"
          className="z-50 min-w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenu.RadioGroup
            value={mode === "all" || selectedIds.length === 0 ? "all" : mode}
            onValueChange={(value) => setMode(value as LabelFilterMode)}
          >
            <ModeRadio value="all" label="All labels" />
            <ModeRadio value="only" label="Only checked" />
            <ModeRadio value="hide" label="Hide checked" />
          </DropdownMenu.RadioGroup>
          {labels.length > 0 ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              {labels.map((label) => (
                <DropdownMenu.CheckboxItem
                  key={label.id}
                  checked={selected.has(label.id)}
                  onCheckedChange={(checked) =>
                    toggleId(label.id, checked === true)
                  }
                  onSelect={(event) => event.preventDefault()}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-xs outline-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <DropdownMenu.ItemIndicator className="absolute left-1.5 inline-flex size-3.5 items-center justify-center">
                    <Icon name="Check" className="size-3" />
                  </DropdownMenu.ItemIndicator>
                  {label.name}
                </DropdownMenu.CheckboxItem>
              ))}
            </>
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No labels yet
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ModeRadio({ value, label }: { value: LabelFilterMode; label: string }) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-xs outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
      )}
    >
      <DropdownMenu.ItemIndicator className="absolute left-1.5 inline-flex size-3.5 items-center justify-center">
        <span className="size-1.5 rounded-full bg-foreground" />
      </DropdownMenu.ItemIndicator>
      {label}
    </DropdownMenu.RadioItem>
  );
}
