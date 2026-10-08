import Link from "next/link";

export function CarTile({
  name,
  model,
  price,
  image,
  bookHref,
  meetHref,
}: {
  name: string;
  model?: string;
  price?: number | null;
  image: { src: string; alt?: string };
  bookHref: string;
  meetHref: string;
}) {
  return (
    <article className="tile">
      <Link href={meetHref}>
        <img
          src={image.src}
          alt={model ? `Photo of ${name}, ${model}` : `Photo of ${name}`}
          width={640}
          height={640}
          loading="lazy"
          decoding="async"
        />
      </Link>
      <span className="cap">
        <strong>{name}</strong>
        {model && <span className="model">{model}</span>}
        {price != null && <span className="price">Starting at ${price}</span>}
        <span className="tile-actions">
          <Link className="btn" href={bookHref}>Book</Link>
          <Link className="btn btn-quiet" href={meetHref}>Meet {name}</Link>
        </span>
      </span>
    </article>
  );
}
