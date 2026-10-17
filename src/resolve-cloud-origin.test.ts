import { describe, expect, it } from "vitest";
import { resolveCloudOrigin } from "./resolve-cloud-origin";

describe("resolveCloudOrigin", () => {
  it("prefers the configured app URL and trims a trailing slash", async () => {
    await expect(
      resolveCloudOrigin("https://bb-agents.example.ts.net/"),
    ).resolves.toBe("https://bb-agents.example.ts.net");
  });

  it("ignores a blank app URL and falls back to Connect or null", async () => {
    const origin = await resolveCloudOrigin("  ");
    expect(origin === null || /^https:\/\//.test(origin)).toBe(true);
  });
});
