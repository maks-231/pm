import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // Proxies API calls to the backend during `next dev` so the frontend can
  // use relative "/api/..." paths exactly as it does in production (where
  // FastAPI serves both the static build and the API from the same origin).
  // No-op for the static export build itself (`next build` runs with
  // NODE_ENV=production), which doesn't support rewrites.
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
