// From bb 0.43, sidebar.threadListProvider stays on the built-in thread list
// unless a plugin sets it. Sidebar Pro used to appear through automatic
// selection. Claim the slot when the saved value is still that default, and
// leave any other plugin list alone.

export const THREAD_LIST_SLOT = "inbox";

const BUILTIN_THREAD_LIST = new Set([
  "thread-list/thread-list",
  "__automatic__",
  "__builtin__",
]);

export function threadListTarget(pluginId: string): string {
  return `${pluginId}/${THREAD_LIST_SLOT}`;
}

export function shouldClaimThreadList(current: string, target: string): boolean {
  if (current === target) return false;
  return BUILTIN_THREAD_LIST.has(current);
}

interface ThreadListPreference {
  revision: number;
  value: string;
}

interface ClaimClient {
  pluginId: string;
  log: { info(message: string): void; warn(message: string): void };
  list(): Promise<ThreadListPreference | null>;
  set(revision: number, value: string): Promise<void>;
}

export async function claimBuiltinThreadList(client: ClaimClient): Promise<void> {
  const target = threadListTarget(client.pluginId);
  const current = await client.list();
  if (current === null || !shouldClaimThreadList(current.value, target)) return;
  try {
    await client.set(current.revision, target);
  } catch {
    const again = await client.list();
    if (again === null || !shouldClaimThreadList(again.value, target)) return;
    await client.set(again.revision, target);
  }
  client.log.info(`selected ${target} as the sidebar thread list`);
}
