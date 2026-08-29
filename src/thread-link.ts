/**
 * bb app routes for a thread. Personal projects use the short form; everything
 * else is project-scoped — same rule as stock bb's `Ee` path helper.
 */
export function threadPath(
  thread: { id: string; projectId: string },
  project: { isPersonal: boolean } | null | undefined,
): string {
  if (project?.isPersonal) return `/threads/${thread.id}`;
  return `/projects/${thread.projectId}/threads/${thread.id}`;
}

/** Absolute URL for a given origin (falls back to the path alone). */
export function threadUrl(
  thread: { id: string; projectId: string },
  project: { isPersonal: boolean } | null | undefined,
  origin: string | null | undefined,
): string {
  const path = threadPath(thread, project);
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export type ThreadLinkOrigins = {
  /** Loopback SPA origin, e.g. http://127.0.0.1:38886 */
  localOrigin: string;
  /** Connect front door when paired, e.g. https://gap.getbb.app; else null */
  cloudOrigin: string | null;
};

/** Write plain text to the clipboard. Returns false when the API is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
