import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLabelChanges,
  assignmentsToMap,
  listAssignments,
  labelsByThreadId,
  labelsFor,
  labelsForThread,
  LabelsProUnavailableError,
  listLabels,
  listThreadsByLabel,
  loadLabelsSnapshot,
  snapshotSignature,
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

describe("snapshotSignature", () => {
  const other: LabelsProLabel = { ...sampleLabel, id: "lbl_2", name: "Ops", slug: "ops" };

  it("ignores the order labels and assignments arrive in", () => {
    const first = snapshotSignature({
      labels: [sampleLabel, other],
      labelIdsByThreadId: new Map([
        ["thr_a", ["lbl_1", "lbl_2"]],
        ["thr_b", ["lbl_2"]],
      ]),
    });
    const second = snapshotSignature({
      labels: [other, sampleLabel],
      labelIdsByThreadId: new Map([
        ["thr_b", ["lbl_2"]],
        ["thr_a", ["lbl_2", "lbl_1"]],
      ]),
    });
    expect(second).toBe(first);
  });

  it("changes when an assignment or a label definition changes", () => {
    const base = {
      labels: [sampleLabel],
      labelIdsByThreadId: new Map([["thr_a", ["lbl_1"]]]),
    };
    const signature = snapshotSignature(base);
    expect(
      snapshotSignature({ ...base, labelIdsByThreadId: new Map([["thr_b", ["lbl_1"]]]) }),
    ).not.toBe(signature);
    expect(
      snapshotSignature({ ...base, labels: [{ ...sampleLabel, name: "Renamed" }] }),
    ).not.toBe(signature);
  });
});

describe("labelsByThreadId", () => {
  it("resolves each thread once and shares an empty array for the rest", () => {
    const byThread = labelsByThreadId(
      [sampleLabel],
      new Map([
        ["thr_a", ["lbl_1"]],
        ["thr_gone", ["missing"]],
      ]),
    );
    expect(labelsFor("thr_a", byThread).map((label) => label.id)).toEqual(["lbl_1"]);
    expect(labelsFor("thr_gone", byThread)).toBe(labelsFor("thr_none", byThread));
    expect(labelsFor("thr_a", null)).toEqual([]);
  });
});

describe("bulk assignments", () => {
  const alpha: LabelsProLabel = { ...sampleLabel, id: "a", name: "Alpha", slug: "alpha" };
  const beta: LabelsProLabel = { ...sampleLabel, id: "b", name: "Beta", slug: "beta" };

  it("inverts label groups into threads, in label order, dropping unknown labels", () => {
    const map = assignmentsToMap(
      [alpha, beta],
      [
        { labelId: "b", threadIds: ["t1", "t2"] },
        { labelId: "a", threadIds: ["t1"] },
        { labelId: "gone", threadIds: ["t3"] },
      ],
    );
    expect(Object.fromEntries(map)).toEqual({ t1: ["a", "b"], t2: ["b"] });
  });

  it("applies a change message and drops threads with no labels left", () => {
    const current = new Map<string, readonly string[]>([
      ["t1", ["a"]],
      ["t2", ["b"]],
    ]);
    const next = applyLabelChanges([alpha, beta], current, {
      t1: ["b", "a"],
      t2: [],
      t3: ["a"],
    });
    expect(Object.fromEntries(next)).toEqual({ t1: ["a", "b"], t3: ["a"] });
    expect(Object.fromEntries(current)).toEqual({ t1: ["a"], t2: ["b"] });
  });

  it("returns the same map when a message changes nothing", () => {
    const current = new Map<string, readonly string[]>([["t1", ["a", "b"]]]);
    expect(applyLabelChanges([alpha, beta], current, { t1: ["b", "a"], t9: [] })).toBe(
      current,
    );
  });

  it("tells an older Labels Pro apart from a missing one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, error: { code: "unknown_method", message: "no" } }),
          { status: 404 },
        ),
      ),
    );
    await expect(listAssignments(null)).rejects.toMatchObject({ code: "unknown_method" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: "unknown plugin" }), { status: 404 }),
      ),
    );
    await expect(listAssignments(null)).rejects.toMatchObject({ code: "unavailable" });
  });
});
