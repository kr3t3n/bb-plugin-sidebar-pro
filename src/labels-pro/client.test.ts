import { afterEach, describe, expect, it, vi } from "vitest";
import {
  labelsForThread,
  LabelsProUnavailableError,
  listLabels,
  listThreadsByLabel,
  loadLabelsSnapshot,
} from "./client";
import type { LabelsProLabel } from "./contract";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleLabel: LabelsProLabel = {
  id: "lbl_1",
  name: "Automations",
  slug: "automations",
  color: null,
  createdAt: 1,
  updatedAt: 1,
};

describe("labelsForThread", () => {
  it("resolves DTOs in assignment order and skips unknown ids", () => {
    const map = new Map<string, readonly string[]>([
      ["thr_a", ["lbl_1", "missing", "lbl_1"]],
    ]);
    expect(
      labelsForThread("thr_a", [sampleLabel], map).map((l) => l.id),
    ).toEqual(["lbl_1", "lbl_1"]);
    expect(labelsForThread("thr_none", [sampleLabel], map)).toEqual([]);
  });
});

describe("listLabels / listThreadsByLabel", () => {
  it("posts null for listLabels and returns the envelope", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.body).toBe("null");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { labels: [sampleLabel] },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listLabels()).resolves.toEqual({ labels: [sampleLabel] });
  });

  it("maps 404 to unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      })),
    );

    await expect(listLabels()).rejects.toBeInstanceOf(LabelsProUnavailableError);
    await expect(listLabels()).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("loadLabelsSnapshot", () => {
  it("inverts listThreadsByLabel into a thread→labelIds map", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/listLabels")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: {
                labels: [
                  sampleLabel,
                  { ...sampleLabel, id: "lbl_2", name: "Other", slug: "other" },
                ],
              },
            }),
          };
        }
        if (path.endsWith("/listThreadsByLabel")) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              // Body is not re-parsed here; return both thread sets via URL? We
              // need to branch on request body.
              return {
                ok: true,
                result: { label: sampleLabel, threadIds: ["thr_a"] },
              };
            },
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );

    // Refine stub to honour labelId in the body.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/listLabels")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: {
                labels: [
                  sampleLabel,
                  { ...sampleLabel, id: "lbl_2", name: "Other", slug: "other" },
                ],
              },
            }),
          };
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          labelId?: string;
        };
        const threadIds =
          body.labelId === "lbl_1"
            ? ["thr_a", "thr_b"]
            : body.labelId === "lbl_2"
              ? ["thr_b"]
              : [];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { label: sampleLabel, threadIds },
          }),
        };
      }),
    );

    const snapshot = await loadLabelsSnapshot();
    expect(snapshot.labels).toHaveLength(2);
    expect(snapshot.labelIdsByThreadId.get("thr_a")).toEqual(["lbl_1"]);
    expect(snapshot.labelIdsByThreadId.get("thr_b")).toEqual([
      "lbl_1",
      "lbl_2",
    ]);
    await expect(listThreadsByLabel("lbl_1")).resolves.toMatchObject({
      threadIds: ["thr_a", "thr_b"],
    });
  });
});
