import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

function sameShallow(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * True when two sidebar rows show the same thing. The host feed can rebuild
 * every row object when one thread changes, so identity alone would redraw
 * the whole list. Nested objects (activity, environment, host) are compared
 * one level deep, which covers every field the row reads.
 */
export function sameSidebarThread(
  left: PluginSidebarThread,
  right: PluginSidebarThread,
): boolean {
  if (left === right) return true;
  const a = left as unknown as Record<string, unknown>;
  const b = right as unknown as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => sameShallow(a[key], b[key]));
}
