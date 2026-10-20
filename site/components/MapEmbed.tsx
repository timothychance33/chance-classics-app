import { mapEmbedSrc } from "@/lib/map-embed";

export function MapEmbed({ query, title }: { query: string; title: string }) {
  return (
    <figure className="area-map">
      <div className="area-map-frame">
        <iframe
          className="area-map-embed"
          title={title}
          src={mapEmbedSrc(query)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <figcaption>{query}</figcaption>
    </figure>
  );
}
