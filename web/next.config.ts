import type { NextConfig } from "next";

const API_PORT = process.env.CANONFORGE_API_PORT ?? "8001";

const nextConfig: NextConfig = {
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
