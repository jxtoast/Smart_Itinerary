import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disable font optimization
  optimizeFonts: false,
  images: {
    unoptimized: true, // Disable image optimization
    remotePatterns: [
      // Remove external image sources temporarily
      // {
      //   protocol: "https",
      //   hostname: "lh3.googleusercontent.com",
      //   pathname: "/**",
      // },
      // {
      //   protocol: "https",
      //   hostname: "img.daisyui.com",
      //   pathname: "/**",
      // },
      // {
      //   protocol: "https",
      //   hostname: "upload.wikimedia.org",
      //   pathname: "/**",
      // },
      // {
      //   protocol: "https",
      //   hostname: "plus.unsplash.com",
      //   pathname: "/**"
      // }
    ],
  },
};

export default nextConfig;
