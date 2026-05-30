/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are written in TS; let Next transpile them.
  transpilePackages: ["@indus/shared", "@indus/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Type-safety restored (phase-0 cleanup, 2026-05-30): the web app type-checks
  // clean, so TYPE ERRORS NOW FAIL THE BUILD instead of shipping silently.
  // ESLint is still skipped at build time (run separately via `pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
