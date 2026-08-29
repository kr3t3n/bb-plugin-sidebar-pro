import { describe, expect, it } from "vitest";
import { resolveCloudOrigin } from "./resolve-cloud-origin";

describe("resolveCloudOrigin", () => {
  it("reads the paired Connect serverUrl from local KV when CLI works or falls back", async () => {
    const origin = await resolveCloudOrigin();
    // This machine is paired as gap — either CLI or KV should yield the URL.
    expect(origin).toBe("https://gap.getbb.app");
  });
});
