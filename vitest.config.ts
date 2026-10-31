import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.{ts,tsx}"],
    environment: "node",
    reporters: ["default"],
    // API tests start in-memory MongoDB instances; cap concurrency so a small
    // /tmp does not run out of the 512 MB each mongod wants.
    maxWorkers: 4,
  },
});
