import { defineConfig } from "vitest/config";

/**
 * Vitest config for @indus/shared.
 *
 * Tests live in `tests/` (outside `src/`) so they don't enter the package's
 * `tsc --noEmit` typecheck. These suites exercise the public Zod schemas /
 * constants — stable surface area other tabs build against.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
