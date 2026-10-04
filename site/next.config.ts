import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers (availability, booking, Stripe webhook) need a server.
  // Pages stay prerendered. The garage app is a separate Vercel project.
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
