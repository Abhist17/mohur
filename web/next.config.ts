import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lets `NEXT_DIST_DIR=.next-check npm run build` verify a build without clobbering a running dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
};

export default nextConfig;
