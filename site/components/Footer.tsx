import { visibleSocial } from "@/data/social";
import { EMAIL } from "@/lib/content";

export function Footer() {
  const social = visibleSocial();
  return (
    <footer className="site-footer">
      <p>Chance Classic Car Rental</p>
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      {social.length > 0 && (
        <p className="footer-social">
          {social.map((link) => (
            <a key={link.name} className="icon-link" href={link.href} aria-label={link.name} target="_blank" rel="noreferrer">
              {link.icon ? <img src={link.icon} alt="" width={20} height={20} /> : link.name}
            </a>
          ))}
        </p>
      )}
      <p className="fine">©2023 by Chance Classic Car Rental.</p>
    </footer>
  );
}
