"use client";

import { useEffect, useState } from "react";
import type { Img } from "@/lib/content";

export function LightboxGallery({ images }: { images: Img[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  return (
    <>
      <div className="masonry">
        {images.map((image, i) => (
          <button key={image.src + i} type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
            <img src={image.src} alt={image.alt || `Photo ${i + 1}`} width={image.w || 800} height={image.h || 600} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo">
          <button className="close" type="button" onClick={() => setOpen(null)} aria-label="Close">
            ×
          </button>
          <img src={images[open].src} alt={images[open].alt || ""} />
        </div>
      )}
    </>
  );
}
