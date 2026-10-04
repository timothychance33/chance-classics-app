import type { MetadataRoute } from "next";
import { SITE_URL, portfolioOrder, posts, services, termsNav } from "@/lib/content";

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
    "/termsandconditions",
    ...termsNav.map((car) => `/terms/${car.slug}`),
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
