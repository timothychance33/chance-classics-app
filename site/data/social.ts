/**
 * Footer links. An empty href does not render.
 * Facebook is site/lib/content.ts FACEBOOK, from the captured site.
 * Instagram is the @chanceclassics account Tim gave on 2026-10-11.
 * No YouTube link. Tim said there is no Chance Classics channel.
 */

import { FACEBOOK, FACEBOOK_ICON } from "@/lib/content";

export type SocialLink = {
  name: string;
  href: string;
  icon?: string;
};

export const socialLinks: SocialLink[] = [
  { name: "Facebook", href: FACEBOOK, icon: FACEBOOK_ICON },
  { name: "Instagram", href: "https://www.instagram.com/chanceclassics/" },
];

export function visibleSocial() {
  return socialLinks.filter((link) => link.href.trim());
}
