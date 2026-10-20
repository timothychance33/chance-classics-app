import { visibleSocial } from "@/data/social";
import { EMAIL, PHONE_DISPLAY, PHONE_TEL } from "@/lib/content";

export function Footer() {
  const social = visibleSocial();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <p>Chance Classics</p>
      <p>
        <a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a>
      </p>
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      <p>
        <a href="/contact/">Contact</a>
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
      <p className="fine">©{year} by Chance Classics.</p>
    </footer>
  );
}
