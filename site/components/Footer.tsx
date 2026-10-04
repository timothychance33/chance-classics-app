import { EMAIL, FACEBOOK, FACEBOOK_ICON } from "@/lib/content";

export function Footer() {
  return (
    <footer className="site-footer">
      <p>Chance Classic Car Rental</p>
      <p>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
      <p>
        <a className="icon-link" href={FACEBOOK} aria-label="Facebook" target="_blank" rel="noreferrer">
          <img src={FACEBOOK_ICON} alt="" width={20} height={20} />
        </a>
      </p>
      <p className="fine">©2023 by Chance Classic Car Rental.</p>
    </footer>
  );
}
