import { defineConfig } from "vitest/config";

/**
 * Vitest config for @indus/api.
 *
 * Tests live OUTSIDE `src/` (in `tests/`) on purpose: the package's
 * `tsc --noEmit` typecheck only compiles `src/**`, so keeping tests out of `src`
 * means test files (which import `vitest`) never break the production typecheck
 * for the other parallel build tabs. Vitest transpiles the TS itself via esbuild.
 *
 * Integration tests that need a live Postgres self-skip via `describe.skip`
 * until `TEST_DATABASE_URL` is wired in CI — see PARALLEL_BUILD_NOTES.md.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    // Allow `pnpm test` to pass before any suite is un-skipped.
    passWithNoTests: true,
  },
});
