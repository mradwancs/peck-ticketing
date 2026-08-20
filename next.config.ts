import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not let a lockfile in a parent directory change Next.js's build root.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
