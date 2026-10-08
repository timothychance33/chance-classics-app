import Link from "next/link";
import { secondCarAddon, weddingPackage } from "@/data/packages";

export function WeddingPackage() {
  if (!weddingPackage.enabled) return null;
  const inclusions = weddingPackage.inclusions.filter((item) => item.included && item.label.trim());
  const hours = weddingPackage.hoursOnSite;
  const framing = weddingPackage.framing.trim();
  const price = weddingPackage.priceUsd;
  const addonPrice = secondCarAddon.priceUsd;
  return (
    <section className="package-card" aria-labelledby="wedding-package">
      <h2 id="wedding-package">{weddingPackage.title}</h2>
      {framing && <p>{framing}</p>}
      {inclusions.length > 0 && (
        <ul>
          {inclusions.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      )}
      {hours != null && <p>{hours} hours on site.</p>}
      <p className="price">{price == null ? "Ask for a quote" : `$${price}`}</p>
      {secondCarAddon.enabled && (
        <p>
          {secondCarAddon.title}
          {addonPrice == null ? " — Ask for a quote" : ` — $${addonPrice}`}
        </p>
      )}
      <p>
        <Link className="btn" href="/quoterequest/">Request a quote</Link>
      </p>
    </section>
  );
}
