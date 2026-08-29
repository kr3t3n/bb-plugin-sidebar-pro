import { describe, expect, it } from "vitest";
import { threadPath, threadUrl } from "./thread-link";

describe("threadPath", () => {
  it("uses the short form for personal projects", () => {
    expect(
      threadPath(
        { id: "thr_1", projectId: "proj_personal" },
        { isPersonal: true },
      ),
    ).toBe("/threads/thr_1");
  });

  it("scopes ordinary projects", () => {
    expect(
      threadPath({ id: "thr_1", projectId: "proj_1" }, { isPersonal: false }),
    ).toBe("/projects/proj_1/threads/thr_1");
  });

  it("defaults to the project-scoped path when the project is unknown", () => {
    expect(threadPath({ id: "thr_1", projectId: "proj_1" }, null)).toBe(
      "/projects/proj_1/threads/thr_1",
    );
  });
});

describe("threadUrl", () => {
  it("prefixes a local origin", () => {
    expect(
      threadUrl(
        { id: "thr_1", projectId: "proj_1" },
        { isPersonal: false },
        "http://127.0.0.1:38886",
      ),
    ).toBe("http://127.0.0.1:38886/projects/proj_1/threads/thr_1");
  });

  it("prefixes a cloud origin", () => {
    expect(
      threadUrl(
        { id: "thr_1", projectId: "proj_1" },
        { isPersonal: false },
        "https://gap.getbb.app",
      ),
    ).toBe("https://gap.getbb.app/projects/proj_1/threads/thr_1");
  });
});
