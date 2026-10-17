// bb-plugin-t3sidebar backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { claimBuiltinThreadList } from "./claim-thread-list";
import { z } from "zod";
import {
  ARCHIVED_CHANNEL,
  ARCHIVED_PAGE_SIZE,
  type ArchivedChange,
  archivedThreadRowSchema,
  type ArchivedThreadRow,
} from "./archived-contract";
import { resolveCloudOrigin } from "./resolve-cloud-origin";
import {
  LABELS_PRO_PLUGIN_ID,
  SIDEBAR_LABEL_CHANGES_CHANNEL,
} from "./labels-pro/contract";
import {
  normalizeProviderLimits,
  providerLimitsResultSchema,
  type ProviderLimitsResult,
} from "./provider-limits";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });

function mapArchivedRow(row: {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  sectionId: string | null;
  originKind: "fork" | null;
  originPluginId: string | null;
  providerId: string;
  hasPendingInteraction: boolean;
  activity: {
    activeBackgroundAgentCount: number;
    activeBackgroundCommandCount: number;
    activeGoalCount: number;
    activePlanModeCount: number;
    activeWorkflowCount: number;
  };
  pinnedAt: number | null;
  environmentId: string | null;
  environmentName: string | null;
  environmentBranchName: string | null;
  environmentProviderId: string | null;
  environmentWorkspaceDisplayKind:
    | "managed-worktree"
    | "unmanaged-worktree"
    | "other";
  createdAt: number;
  updatedAt: number;
  lastReadAt: number | null;
  latestAttentionAt: number;
}): ArchivedThreadRow {
  return archivedThreadRowSchema.parse({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    titleFallback: row.titleFallback,
    parentThreadId: row.parentThreadId,
    sectionId: row.sectionId,
    originKind: row.originKind,
    originPluginId: row.originPluginId,
    providerId: row.providerId,
    hasPendingInteraction: row.hasPendingInteraction,
    activity: {
      workflows: row.activity.activeWorkflowCount,
      backgroundAgents: row.activity.activeBackgroundAgentCount,
      backgroundCommands: row.activity.activeBackgroundCommandCount,
      planMode: row.activity.activePlanModeCount,
      goals: row.activity.activeGoalCount,
    },
    isPinned: row.pinnedAt !== null,
    environment:
      row.environmentId === null
        ? null
        : {
            id: row.environmentId,
            name: row.environmentName,
            branchName: row.environmentBranchName,
            providerId: row.environmentProviderId,
            workspaceDisplayKind: row.environmentWorkspaceDisplayKind,
          },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReadAt: row.lastReadAt,
    latestAttentionAt: row.latestAttentionAt,
  });
}

export const t3sidebarRpcContract = defineRpcContract({
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
        }),
      ),
    }),
  },
  /**
   * Origins for "Copy local/remote link". Local is always this server's
   * loopback SPA; cloud is the Connect front door when paired.
   */
  linkOrigins: {
    input: z.object({}),
    output: z.object({
      localOrigin: z.string(),
      cloudOrigin: z.string().nullable(),
    }),
  },
  /** Archived threads for the sidebar Archive toggle (host feed excludes them). */
  listArchived: {
    input: z.object({
      projectId: z.string().trim().min(1).optional(),
      /** Rows to skip, newest first (the host orders by last update). */
      offset: z.number().int().nonnegative().optional(),
    }),
    output: z.object({
      threads: z.array(archivedThreadRowSchema),
      /** Rows the host returned for this page, before malformed rows drop. */
      pageRows: z.number().int(),
      hasMore: z.boolean(),
    }),
  },
  unarchive: {
    input: threadIdSchema,
    output: z.object({ ok: z.boolean() }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  /**
   * Called by Labels Pro after label writes (see subscribeLabelChanges). The
   * app delivers a realtime signal only to the plugin that sent it, so this
   * server republishes the change for our own frontend.
   */
  labelsProChanged: {
    input: z.object({
      revision: z.number().int(),
      threads: z.record(z.string(), z.array(z.string())),
      labelsChanged: z.boolean(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Codex, Anthropic, and Cursor quota still left. No account email. */
  providerLimits: {
    input: z.object({}),
    output: providerLimitsResultSchema,
  },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";

export default function plugin(bb: BbPluginApi) {
  void claimBuiltinThreadList({
    pluginId: bb.pluginId,
    log: bb.log,
    async list() {
      const listed = await bb.sdk.system.uiPreferences.list();
      const entry = listed.preferences["sidebar.threadListProvider"];
      return entry ?? null;
    },
    async set(revision, value) {
      await bb.sdk.system.uiPreferences.set({
        key: "sidebar.threadListProvider",
        expectedRevision: revision,
        value,
      });
    },
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown";
    bb.log.warn(`thread list select failed: ${message}`);
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  const usageCache: { expiresAt: number; value: ProviderLimitsResult } = {
    expiresAt: 0,
    value: providerLimitsResultSchema.parse({
      providers: normalizeProviderLimits(null),
    }),
  };

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(
          `SELECT thread_id, settled_at, snoozed_until, snoozed_at
             FROM thread_lifecycle`,
        )
        .all() as LifecycleDbRow[]
    ).map((row) => ({
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
    }));

  const write = (row: StoredLifecycleRow): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at`,
    ).run(row.threadId, row.settledAt, row.snoozedUntil, row.snoozedAt);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
  };

  const clear = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(
      threadId,
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  const publishArchivedChanged = (change: ArchivedChange): void => {
    bb.realtime.publish(ARCHIVED_CHANNEL, change);
  };

  // Ask Labels Pro to call labelsProChanged after label writes. Labels Pro
  // stores the subscription, so one success is enough; repeating it is safe
  // and covers a reinstall that lost it. Labels Pro may load after us, hence
  // the early retries.
  let labelsSubscribed = false;
  const subscribeLabelChanges = async () => {
    try {
      await bb.sdk.plugins.callRpc({
        pluginId: LABELS_PRO_PLUGIN_ID,
        method: "subscribeChanges",
        input: { method: "labelsProChanged" },
        outputSchema: z.object({ revision: z.number() }),
      });
      if (!labelsSubscribed) {
        labelsSubscribed = true;
        // Changes made while we were not subscribed never reached us.
        bb.realtime.publish(SIDEBAR_LABEL_CHANGES_CHANNEL, {
          revision: 0,
          threads: {},
          labelsChanged: true,
        });
      }
    } catch {
      // Labels Pro is missing, disabled, or an older build. The frontend
      // falls back on its own; nothing to report here.
      labelsSubscribed = false;
    }
  };
  void subscribeLabelChanges();
  for (const delayMs of [30_000, 120_000]) {
    setTimeout(() => void subscribeLabelChanges(), delayMs).unref?.();
  }
  bb.background.schedule("labels-pro-subscribe", "*/10 * * * *", () =>
    subscribeLabelChanges(),
  );

  bb.rpc.register(t3sidebarRpcContract, {
    async listLifecycle() {
      return { rows: readAll() };
    },
    labelsProChanged(input, context?: unknown) {
      // Only Labels Pro may speak for Labels Pro. Older hosts pass no caller.
      const caller = (
        context as { experimental_caller?: { kind: string; pluginId?: string } }
      )?.experimental_caller;
      if (
        caller !== undefined &&
        !(caller.kind === "plugin" && caller.pluginId === LABELS_PRO_PLUGIN_ID)
      ) {
        return { ok: false };
      }
      bb.realtime.publish(SIDEBAR_LABEL_CHANGES_CHANNEL, input);
      return { ok: true };
    },
    async linkOrigins() {
      return {
        localOrigin: bb.server.loopbackBaseUrl.replace(/\/$/, ""),
        cloudOrigin: await resolveCloudOrigin(bb.server.experimental_appUrl),
      };
    },
    async listArchived({ projectId, offset = 0 }) {
      // One page per call. Loading every archived thread took up to 14 s
      // with a few thousand rows, and the view needs one screen at first.
      const page = await bb.sdk.threads.list({
        archived: true,
        includeHidden: true,
        ...(projectId ? { projectId } : {}),
        limit: ARCHIVED_PAGE_SIZE,
        offset,
      });
      const rows = Array.isArray(page) ? page : [];
      const threads: ArchivedThreadRow[] = [];
      for (const row of rows) {
        try {
          threads.push(mapArchivedRow(row));
        } catch {
          // Skip malformed rows rather than failing the whole page.
        }
      }
      return {
        threads,
        pageRows: rows.length,
        hasMore: rows.length === ARCHIVED_PAGE_SIZE,
      };
    },
    async unarchive({ threadId }) {
      await bb.sdk.threads.unarchive({ threadId });
      publishArchivedChanged({ type: "unarchived", threadId });
      return { ok: true };
    },
    async settle({ threadId }) {
      // Settling clears any snooze: they are two answers to the same
      // question, and holding both would make the shelf order ambiguous.
      write({
        threadId,
        settledAt: Date.now(),
        snoozedUntil: null,
        snoozedAt: null,
      });
      return { ok: true };
    },
    async unsettle({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
    async snooze({ threadId, snoozedUntil }) {
      const now = Date.now();
      write({
        threadId,
        settledAt: null,
        snoozedUntil,
        snoozedAt: now,
      });
      return { ok: true };
    },
    async unsnooze({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
    async providerLimits() {
      const now = Date.now();
      if (now < usageCache.expiresAt) return usageCache.value;
      try {
        const raw = await bb.sdk.system.usageLimits();
        const value = providerLimitsResultSchema.parse({
          providers: normalizeProviderLimits(raw),
        });
        usageCache.expiresAt = now + 45_000;
        usageCache.value = value;
        return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        bb.log.warn(`provider usage read failed: ${message}`);
        const value = providerLimitsResultSchema.parse({
          providers: normalizeProviderLimits(null),
        });
        usageCache.expiresAt = now + 15_000;
        usageCache.value = value;
        return value;
      }
    },
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id);
    publishArchivedChanged({ type: "deleted", threadId: thread.id });
  });
  bb.events.on("thread.archived", ({ thread }) => {
    publishArchivedChanged({ type: "archived", threadId: thread.id });
  });
  bb.events.on("thread.unarchived", ({ thread }) => {
    publishArchivedChanged({ type: "unarchived", threadId: thread.id });
  });
}
