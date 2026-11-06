import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every iFit screen is per-user and reads the auth cookie, so pages render
  // dynamically under the classic model rather than Cache Components.
  cacheComponents: false,
  // Keep Next.js from writing an AGENTS.md into the checkout; team agent
  // instructions are local-only and must never be committed.
  agentRules: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
