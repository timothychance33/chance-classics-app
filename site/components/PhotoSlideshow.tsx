"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Img } from "@/lib/content";

export type SlideshowImage = Pick<Img, "src" | "alt"> & Partial<Pick<Img, "w" | "h">>;

const SWIPE_MIN_PX = 48;

/**
 * One-photo carousel for occasion galleries. No extra dependencies:
 * buttons, dots, arrow keys, and a horizontal touch swipe.
 */
export function PhotoSlideshow({
  images,
  label = "Photos",
}: {
  images: SlideshowImage[];
  label?: string;
}) {
  const count = images.length;
  const [index, setIndex] = useState(0);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const safeIndex = count === 0 ? 0 : ((index % count) + count) % count;
  const current = images[safeIndex];

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((currentIndex) => (currentIndex + delta + count) % count);
    },
    [count],
  );

  const show = useCallback(
    (next: number) => {
      if (count < 1) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  function preloadNext() {
    if (count < 2) return;
    const upcoming = images[(safeIndex + 1) % count];
    if (!upcoming) return;
    const preload = new Image();
    preload.decoding = "async";
    preload.src = upcoming.src;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || count < 2) return;
    if ((event.target as HTMLElement).closest("button")) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  }

  if (!current) return null;

  const alt = current.alt || `Photo ${safeIndex + 1}`;
  const position = `${safeIndex + 1} / ${count}`;

  return (
    <div
      className="photo-slideshow"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div
        className="frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        <img
          key={current.src + safeIndex}
          src={current.src}
          alt={alt}
          width={current.w || 1200}
          height={current.h || 1600}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={preloadNext}
        />
        {count > 1 && (
          <>
            <button type="button" className="arrow prev" onClick={() => step(-1)} aria-label="Previous photo">
              <Chevron dir="left" />
            </button>
            <button type="button" className="arrow next" onClick={() => step(1)} aria-label="Next photo">
              <Chevron dir="right" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <>
          <p className="sr-only" aria-live="polite">
            Photo {safeIndex + 1} of {count}. {alt}
          </p>
          <p className="count" aria-hidden="true">
            {position}
          </p>
          <div className="dots" role="group" aria-label="Choose a photo">
            {images.map((image, i) => (
              <button
                key={image.src + i}
                type="button"
                className={i === safeIndex ? "on" : undefined}
                aria-label={`Photo ${i + 1} of ${count}`}
                aria-current={i === safeIndex ? "true" : undefined}
                onClick={() => show(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={dir === "left" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
