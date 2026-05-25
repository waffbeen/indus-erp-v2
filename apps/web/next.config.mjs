/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are written in TS; let Next transpile them.
  transpilePackages: ["@indus/shared", "@indus/ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Run typecheck/lint via `pnpm typecheck` in CI; don't block production builds on them.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
