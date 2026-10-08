import photos from "@/data/event-photos.json";

type Photo = { src: string; alt: string };
const lists = photos as Record<string, Photo[]>;

export function EventPhotos({ slug }: { slug: string }) {
  const items = (lists[slug] || []).filter((item) => item.src && item.alt);
  if (!items.length) return null;
  return (
    <section className="event-photos" aria-label="Customer photos">
      <h2>From events</h2>
      <div className="thumbs">
        {items.map((item) => (
          <img key={item.src} src={item.src} alt={item.alt} width={232} height={232} loading="lazy" />
        ))}
      </div>
    </section>
  );
}
