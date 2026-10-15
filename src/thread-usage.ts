import { z } from "zod";

const usageWindowSchema = z.object({
  label: z.string(),
  usedPercent: z.number().finite().nullable(),
  resetsAt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

const usageResponseSchema = z.record(z.string(), z.object({
  status: z.string(),
  windows: z.array(usageWindowSchema).optional(),
}));

export type ThreadUsage = z.infer<typeof usageResponseSchema>;
export type ThreadUsageLimit = { detail: string; resetsAt: number | null };

export function parseThreadUsage(raw: unknown): ThreadUsage | null {
  const parsed = usageResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function threadUsageLimit(
  usage: ThreadUsage | undefined,
  providerId: string,
  now: number,
): ThreadUsageLimit | null {
  const provider = usage?.[providerId];
  if (provider?.status !== "ok") return null;
  const windows = (provider.windows ?? []).filter((window) => {
    if (window.model !== undefined && window.model !== null) return false;
    if (/\b(fable|sonnet|opus|haiku)\b/i.test(window.label)) return false;
    if (window.usedPercent === null || window.usedPercent < 100) return false;
    if (!window.resetsAt) return true;
    const reset = Date.parse(window.resetsAt);
    return !Number.isFinite(reset) || reset > now;
  });
  if (windows.length === 0) return null;
  const knownResets = windows.map((window) => Date.parse(window.resetsAt ?? ""));
  const resetsAt = knownResets.every(Number.isFinite) ? Math.max(...knownResets) : null;
  const resetDetail = resetsAt === null
    ? "Reset time unavailable."
    : `Resets ${new Date(resetsAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })}.`;
  return {
    detail: `Usage limit reached. ${windows.map((window) => window.label).join(", ")}. ${resetDetail}`,
    resetsAt,
  };
}
