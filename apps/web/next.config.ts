import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@smart/shared", "@smart/api-client"],
  // Same-origin proxy to the API gateway (Phase 2 rewiring, T2.3–T2.5).
  //
  // The web app ships no app/api/* route handlers of its own any more
  // (T3.4 removed the monolith stubs) — every /api/* call the browser makes
  // is forwarded to the gateway, which enforces the JWT before relaying to
  // the backend services. The destination is server-side only — it is not
  // inlined into the browser bundle (and an origin is not a secret).
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
