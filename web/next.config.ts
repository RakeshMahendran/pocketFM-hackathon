import path from "node:path";
import type { NextConfig } from "next";

const API_PORT = process.env.CANONFORGE_API_PORT ?? "8001";

const nextConfig: NextConfig = {
  // Turbopack picks the workspace root by looking for a lockfile, and the
  // Databricks Apps build step generates one beside the root package.json —
  // so it chose the repo root and warned that it had found two. Pinning it to
  // web/ makes the build resolve the same way in Apps as it does locally.
  turbopack: { root: __dirname },

  // Next serves the app; FastAPI runs beside it on a loopback port and is
  // reached only through this rewrite, so there is one public origin and no
  // CORS. A static export was tried first and cannot work: the sign-in flow
  // sets a cookie from a server action, and an export has no server at all.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${API_PORT}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
