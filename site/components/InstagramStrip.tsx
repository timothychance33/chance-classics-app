import { visibleSocial } from "@/data/social";

/** Follow link only. The repo has the profile URL and no Instagram post media. */
export function InstagramStrip() {
  const instagram = visibleSocial().find((link) => link.name === "Instagram");
  if (!instagram) return null;
  return (
    <aside className="instagram-strip">
      <p>More photos of the cars are on Instagram.</p>
      <p>
        <a href={instagram.href} target="_blank" rel="noreferrer">
          Follow @chanceclassics
        </a>
      </p>
    </aside>
  );
}
