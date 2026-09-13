import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use standalone output for Docker containers; Vercel natively handles serverless output
  output: process.env.OUTPUT_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
