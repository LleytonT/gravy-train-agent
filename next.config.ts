import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Agent libs use NodeNext-style `*.js` import specifiers that point at `.ts`
  // sources. Webpack needs extensionAlias so Next can bundle `/api/onboarding`.
  // (Turbopack in Next 16.2 lacks resolveExtensionAlias; use --webpack for build/dev.)
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default withEve(nextConfig, {
  // Explicit shell-friendly command for the Eve Build Output service on Vercel.
  eveBuildCommand: "pnpm run build:eve",
});
