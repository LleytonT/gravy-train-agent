import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // TypeScript 7 has no JS compiler API; run project-local `tsc` during build.
  experimental: {
    useTypeScriptCli: true,
  },
};

export default withEve(nextConfig);
