/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are written in TS; let Next transpile them.
  transpilePackages: ["@indus/shared", "@indus/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Run typecheck/lint via `pnpm typecheck` in CI; don't block production builds on them.
  // TODO(phase0-cleanup): remove both `ignoreBuildErrors` and `ignoreDuringBuilds`
  // once `pnpm --filter @indus/web typecheck` is clean, so type/lint regressions
  // fail the build instead of shipping silently. Left enabled for now because the
  // web app may not type-check until the in-flight parallel modules land.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
