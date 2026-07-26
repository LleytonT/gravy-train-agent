import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withEve(nextConfig, {
  // Explicit shell-friendly command for the Eve Build Output service on Vercel.
  eveBuildCommand: "pnpm run build:eve",
});
