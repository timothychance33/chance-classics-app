/**
 * Footer links. An empty href does not render.
 * Facebook is site/lib/content.ts FACEBOOK, from the captured site.
 * No YouTube or Instagram URL is in the repo, including a search for
 * youtube, youtu.be, and instagram. The 2nd Chance Classics channel
 * stays blank until Tim pastes the URL.
 */

import { FACEBOOK, FACEBOOK_ICON } from "@/lib/content";

export type SocialLink = {
  name: string;
  href: string;
  icon?: string;
};

export const socialLinks: SocialLink[] = [
  { name: "Facebook", href: FACEBOOK, icon: FACEBOOK_ICON },
  { name: "YouTube", href: "" },
  { name: "Instagram", href: "" },
];

export function visibleSocial() {
  return socialLinks.filter((link) => link.href.trim());
}
