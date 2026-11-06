import type { NextConfig } from "next";

const isExport = process.env.STATIC_EXPORT === "1";
const basePath = isExport ? process.env.BASE_PATH || "" : "";

const nextConfig: NextConfig = {
  devIndicators: false, // keep the dev badge out of screenshots
  // lets `NEXT_DIST_DIR=.next-check npm run build` verify a build without clobbering a running dev server
  // lets plain <img>/<image> tags find /public assets under the GitHub Pages sub-path
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  distDir: process.env.NEXT_DIST_DIR || ".next", // static export lands in distDir too (CI uses NEXT_DIST_DIR=site)
  // GitHub Pages: a fully static site (the app is client-side: every read goes through Anon-RPC in the browser)
  ...(isExport
    ? {
        output: "export" as const,
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
