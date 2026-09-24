import { describe, expect, it, vi } from "vitest";
import {
  claimBuiltinThreadList,
  shouldClaimThreadList,
  threadListTarget,
} from "./claim-thread-list";

describe("shouldClaimThreadList", () => {
  const target = threadListTarget("sidebar-pro");

  it("claims the built-in default and the old automatic values", () => {
    expect(shouldClaimThreadList("thread-list/thread-list", target)).toBe(true);
    expect(shouldClaimThreadList("__automatic__", target)).toBe(true);
    expect(shouldClaimThreadList("__builtin__", target)).toBe(true);
  });

  it("leaves Sidebar Pro and any other plugin list in place", () => {
    expect(shouldClaimThreadList(target, target)).toBe(false);
    expect(shouldClaimThreadList("t3sidebar/inbox", target)).toBe(false);
  });
});

describe("claimBuiltinThreadList", () => {
  it("writes sidebar-pro/inbox when the list is still the built-in default", async () => {
    const set = vi.fn(async () => {});
    await claimBuiltinThreadList({
      pluginId: "sidebar-pro",
      log: { info() {}, warn() {} },
      list: async () => ({ revision: 0, value: "thread-list/thread-list" }),
      set,
    });
    expect(set).toHaveBeenCalledWith(0, "sidebar-pro/inbox");
  });

  it("retries once when the revision changes under the write", async () => {
    let reads = 0;
    const set = vi.fn(async (revision: number) => {
      if (revision === 0) throw new Error("conflict");
    });
    await claimBuiltinThreadList({
      pluginId: "sidebar-pro",
      log: { info() {}, warn() {} },
      list: async () => {
        reads += 1;
        return { revision: reads === 1 ? 0 : 1, value: "thread-list/thread-list" };
      },
      set,
    });
    expect(set).toHaveBeenNthCalledWith(1, 0, "sidebar-pro/inbox");
    expect(set).toHaveBeenNthCalledWith(2, 1, "sidebar-pro/inbox");
  });
});
