import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

type ConnectStatus = {
  paired?: boolean;
  url?: string | null;
};

function normalizeOrigin(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim().replace(/\/$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

/** Prefer the desktop-bundled CLI (`BB_CLI`), then bare `bb` on PATH. */
async function resolveCloudOriginViaCli(): Promise<string | null> {
  const bins = [
    process.env.BB_CLI?.trim(),
    "bb",
  ].filter((value): value is string => Boolean(value));

  for (const bin of bins) {
    try {
      const { stdout } = await execFileAsync(
        bin,
        ["connect", "status", "--json"],
        {
          timeout: 5_000,
          maxBuffer: 64 * 1024,
          env: process.env,
        },
      );
      const status = JSON.parse(stdout) as ConnectStatus;
      if (!status.paired) continue;
      const origin = normalizeOrigin(status.url);
      if (origin) return origin;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Read Connect's paired `serverUrl` straight from the host KV store.
 * Avoids depending on PATH inside the bb server process.
 */
function resolveCloudOriginFromKv(): string | null {
  const dataDir =
    process.env.BB_DATA_DIR?.trim() || join(homedir(), ".bb");
  const dbPath = join(dataDir, "bb.db");
  try {
    // better-sqlite3 is provided by the bb server toolchain; require it the
    // same way other plugin backends do for ad-hoc local reads.
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const row = db
        .prepare(
          `SELECT value FROM plugin_kv WHERE plugin_id = ? AND key = ?`,
        )
        .get("connect", "credential") as { value: string } | undefined;
      if (!row?.value) return null;
      const parsed = JSON.parse(row.value) as { serverUrl?: string };
      return normalizeOrigin(parsed.serverUrl);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Read Connect's public URL (CLI first, then local KV fallback). */
export async function resolveCloudOrigin(): Promise<string | null> {
  return (
    (await resolveCloudOriginViaCli()) ?? resolveCloudOriginFromKv()
  );
}
