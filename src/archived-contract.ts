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
 * Rows per archive page. The view loads more pages as you scroll, or while a
 * filter leaves less than a screen of matches.
 */
export const ARCHIVED_PAGE_SIZE = 200;

/** Realtime payload on ARCHIVED_CHANNEL. */
export type ArchivedChange =
  | { type: "archived"; threadId: string }
  | { type: "unarchived"; threadId: string }
  | { type: "deleted"; threadId: string };
