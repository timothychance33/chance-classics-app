import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers (availability, booking, Stripe webhook) need a server.
  // Pages stay prerendered. The garage app is a separate Vercel project.
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  async redirects() {
    const www = { has: [{ type: "host" as const, value: "www.chanceclassics.com" }], permanent: true as const };
    return [
      { source: "/", ...www, destination: "https://chanceclassics.com/" },
      { source: "/:path*", ...www, destination: "https://chanceclassics.com/:path*" },
      { source: "/cart-page", destination: "/book-online/", permanent: true },
      { source: "/portfolio-collections/my-portfolio", destination: "/portfolio/", permanent: true },
      { source: "/portfolio-collections/my-portfolio/others", destination: "/portfolio/", permanent: true },
      { source: "/others", destination: "/portfolio/", permanent: true },
      {
        source: "/occasions/prom-and-homecoming",
        destination: "/occasions/parades-and-special-events/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
