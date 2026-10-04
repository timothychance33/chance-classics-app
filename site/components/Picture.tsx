import type { Img } from "@/lib/content";

export function Picture({
  image,
  alt,
  className,
  priority = false,
  width,
  height,
  position,
}: {
  image: Img;
  alt?: string;
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
  /** CSS object-position, for images that are cropped with object-fit: cover. */
  position?: string;
}) {
  const label = alt ?? image.alt;
  return (
    <img
      src={image.src}
      alt={label}
      width={width || image.w || 1200}
      height={height || image.h || 800}
      className={className}
      style={position ? { objectPosition: position } : undefined}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
