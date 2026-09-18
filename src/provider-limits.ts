import { z } from "zod";

/** Sidebar order: Codex, Anthropic, Cursor. */
export const PROVIDER_LIMITS = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Anthropic" },
  { id: "acp-cursor", label: "Cursor" },
] as const;

export const providerLimitIdSchema = z.enum([
  "codex",
  "claude-code",
  "acp-cursor",
]);

export const providerLimitWindowSchema = z.object({
  label: z.string(),
  usedPercent: z.number().nullable(),
  remainingPercent: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

export const providerLimitSchema = z.object({
  providerId: providerLimitIdSchema,
  label: z.string(),
  status: z.enum(["ok", "unavailable"]),
  windows: z.array(providerLimitWindowSchema).max(8),
});

export const providerLimitsResultSchema = z.object({
  providers: z.array(providerLimitSchema).max(3),
});

export type ProviderLimitId = z.infer<typeof providerLimitIdSchema>;
export type ProviderLimitWindow = z.infer<typeof providerLimitWindowSchema>;
export type ProviderLimit = z.infer<typeof providerLimitSchema>;
export type ProviderLimitsResult = z.infer<typeof providerLimitsResultSchema>;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function emptyProviderLimits(): ProviderLimit[] {
  return PROVIDER_LIMITS.map((provider) => ({
    providerId: provider.id,
    label: provider.label,
    status: "unavailable",
    windows: [],
  }));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/** Percent still available. 100 means unused. 0 means the window is full. */
export function remainingPercent(usedPercent: number | null): number | null {
  if (usedPercent === null) return null;
  const remaining = 100 - usedPercent;
  if (!Number.isFinite(remaining)) return null;
  return Math.max(0, Math.min(100, Math.round(remaining)));
}

/** Four signal bars. A full set means most of the window is still left. */
export function signalLevel(remaining: number | null): 0 | 1 | 2 | 3 | 4 {
  if (remaining === null) return 0;
  if (remaining <= 5) return 0;
  if (remaining < 25) return 1;
  if (remaining < 50) return 2;
  if (remaining < 75) return 3;
  return 4;
}

export type LimitTone = "unknown" | "ok" | "low" | "critical";

export function limitTone(remaining: number | null): LimitTone {
  if (remaining === null) return "unknown";
  if (remaining <= 15) return "critical";
  if (remaining <= 40) return "low";
  return "ok";
}

function readWindows(value: unknown): ProviderLimitWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: ProviderLimitWindow[] = [];
  for (const item of value) {
    if (windows.length >= 8) break;
    if (item === null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (label.length === 0) continue;
    const used = finiteNumber(row.usedPercent);
    const resetsAt = typeof row.resetsAt === "string" ? row.resetsAt : null;
    windows.push({
      label,
      usedPercent: used,
      remainingPercent: remainingPercent(used),
      resetsAt,
    });
  }
  return windows;
}

/**
 * Map `bb.sdk.system.usageLimits()` into the three sidebar providers.
 * Drops account email and plan text. Always returns Codex, Anthropic, Cursor.
 */
export function normalizeProviderLimits(raw: unknown): ProviderLimit[] {
  const record =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return PROVIDER_LIMITS.map((provider) => {
    const block = record[provider.id];
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      return {
        providerId: provider.id,
        label: provider.label,
        status: "unavailable" as const,
        windows: [],
      };
    }
    const status = (block as Record<string, unknown>).status;
    const windows =
      status === "ok"
        ? readWindows((block as Record<string, unknown>).windows)
        : [];
    const usable = windows.some((window) => window.remainingPercent !== null);
    return {
      providerId: provider.id,
      label: provider.label,
      status: usable ? ("ok" as const) : ("unavailable" as const),
      windows: usable ? windows : [],
    };
  });
}

export function formatReset(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const month = MONTHS[date.getMonth()] ?? "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${hours}:${minutes}`;
}

/** Hover and screen-reader text. One sentence per window. */
export function providerLimitLabel(row: ProviderLimit): string {
  if (row.status !== "ok" || row.windows.length === 0) {
    return `${row.label} usage is unavailable.`;
  }
  const parts = row.windows.map((window) => {
    const left =
      window.remainingPercent === null
        ? "remaining is unknown"
        : `${window.remainingPercent}% left`;
    const reset = formatReset(window.resetsAt);
    const resetText = reset ? ` Resets ${reset}.` : "";
    return `${window.label}: ${left}.${resetText}`;
  });
  return `${row.label}. ${parts.join(" ")}`;
}
