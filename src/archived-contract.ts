import { z } from "zod";

/** Realtime channel when the archived set changes. */
export const ARCHIVED_CHANNEL = "archived-threads";

const environmentSchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    branchName: z.string().nullable(),
    providerId: z.string().nullable(),
    workspaceDisplayKind: z
      .enum(["managed-worktree", "unmanaged-worktree", "other"])
      .nullable(),
  })
  .nullable();

export const archivedThreadRowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().nullable(),
  titleFallback: z.string().nullable(),
  parentThreadId: z.string().nullable(),
  sectionId: z.string().nullable(),
  originKind: z.enum(["fork"]).nullable(),
  originPluginId: z.string().nullable(),
  providerId: z.string(),
  hasPendingInteraction: z.boolean(),
  activity: z.object({
    workflows: z.number(),
    backgroundAgents: z.number(),
    backgroundCommands: z.number(),
    planMode: z.number(),
    goals: z.number(),
  }),
  isPinned: z.boolean(),
  environment: environmentSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  lastReadAt: z.number().nullable(),
  latestAttentionAt: z.number(),
});

export type ArchivedThreadRow = z.infer<typeof archivedThreadRowSchema>;

/**
 * Soft ceiling so a pathological archive cannot blow the RPC. Normal fleets
 * stay well under this; Hide/Only label filters need the full set because the
 * newest page is often all automations.
 */
export const ARCHIVED_LIST_LIMIT = 10_000;
