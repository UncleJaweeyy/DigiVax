import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // This fixes the 1MB limit error
    },
  },
};

export default nextConfig;