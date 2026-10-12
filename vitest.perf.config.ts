import { defineConfig } from "vitest/config";

// Render benchmarks. Not part of `npm test`: timings depend on the machine.
export default defineConfig({
  test: {
    name: "bb-plugin-sidebar-pro-perf",
    include: ["bench/**/*.perf.tsx"],
    testTimeout: 600_000,
    silent: false,
  },
});
