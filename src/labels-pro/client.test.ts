import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignmentMapFromResult,
  LabelsProUnavailableError,
  listAssignments,
  listLabels,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("assignmentMapFromResult", () => {
  it("indexes label ids by thread id and drops bad rows", () => {
    const map = assignmentMapFromResult({
      assignments: [
        { threadId: "thr_a", labelIds: ["lbl_1", "lbl_2"] },
        { threadId: "", labelIds: ["lbl_x"] },
        { threadId: "thr_b", labelIds: ["", "lbl_3"] as string[] },
      ],
    });
    expect([...map.keys()]).toEqual(["thr_a", "thr_b"]);
    expect(map.get("thr_a")).toEqual(["lbl_1", "lbl_2"]);
    expect(map.get("thr_b")).toEqual(["lbl_3"]);
  });
});

describe("listLabels / listAssignments", () => {
  it("returns the RPC result envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("listLabels")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: { labels: [{ id: "lbl_1", name: "Automations", color: null }] },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              assignments: [{ threadId: "thr_1", labelIds: ["lbl_1"] }],
            },
          }),
        };
      }),
    );

    await expect(listLabels()).resolves.toEqual({
      labels: [{ id: "lbl_1", name: "Automations", color: null }],
    });
    await expect(listAssignments()).resolves.toEqual({
      assignments: [{ threadId: "thr_1", labelIds: ["lbl_1"] }],
    });
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
