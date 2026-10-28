import type { NextConfig } from "next";

const backendOrigin = process.env.ADV_ON_BACKEND_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(process.env.VERCEL
    ? {
        turbopack: {
          resolveAlias: {
            "cloudflare:workers": "./lib/cloudflare-workers-vercel.ts",
          },
        },
      }
    : {}),
  async rewrites() {
    if (!backendOrigin) return [];

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendOrigin}/api/:path*`,
        },
        {
          source: "/mcp",
          destination: `${backendOrigin}/mcp`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
