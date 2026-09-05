import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smart/shared", "@smart/api-client"],
  // Same-origin proxy to the API gateway (Phase 2 rewiring, T2.3–T2.5).
  //
  // The plain-array form runs AFTER filesystem routes, so the legacy monolith
  // route handlers under app/api/* (and app/auth/callback) keep working until
  // their pages are cut over; anything else under /api/* that no page calls
  // yet is simply never requested. Destination is server-side only — it is
  // not inlined into the browser bundle (and an origin is not a secret).
  // In compose the gateway is a sibling container: API_GATEWAY_URL=http://gateway:8080.
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${process.env.API_GATEWAY_URL ?? "http://localhost:8080"}/api/:path*`,
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.daisyui.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
        pathname: "/**"
      }
    ],
  },
};

export default nextConfig;
