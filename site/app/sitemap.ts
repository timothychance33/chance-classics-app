import type { MetadataRoute } from "next";
import { SITE_URL, portfolioOrder, posts, services } from "@/lib/content";
import { occasions } from "@/lib/occasions";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/about",
    "/services",
    "/portfolio",
    "/portfolio-collections/my-portfolio",
    ...portfolioOrder.map((slug) => `/portfolio-collections/my-portfolio/${slug}`),
    "/quoterequest",
    "/registrationthanks",
    "/book-online",
    ...services.map((service) => `/service-page/${service.slug}`),
    ...services.map((service) => `/booking-calendar/${service.slug}`),
    "/rental-terms",
    ...occasions.map((occasion) => `/occasions/${occasion.slug}`),
    "/faq",
    "/blog",
    ...posts.map((post) => `/post/${post.slug}`),
    "/cart-page",
    "/booking-form",
    "/payment-request-page",
  ];
  return paths.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "/" : `${path}/`}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
