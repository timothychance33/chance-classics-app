import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers (availability, booking, Stripe webhook) need a server.
  // Pages stay prerendered. The garage app is a separate Vercel project.
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/occasions/prom-and-homecoming",
        destination: "/occasions/parades-and-special-events/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
