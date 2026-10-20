"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Img } from "@/lib/content";

export type SlideshowImage = Pick<Img, "src" | "alt"> & Partial<Pick<Img, "w" | "h">>;

const SWIPE_MIN_PX = 48;
const AUTO_MS = 4000;

/**
 * One-photo carousel for occasion galleries. No extra dependencies:
 * buttons, dots, arrow keys, and a horizontal touch swipe.
 * Advances on its own about every 4 seconds, looping. A manual move
 * restarts that wait. Autoplay stays off for reduced motion, a hidden tab,
 * or while the carousel is offscreen.
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
  const [hold, setHold] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const holdUntil = useRef(0);
  const touching = useRef(false);
  const manualAnnounce = useRef(false);
  const safeIndex = count === 0 ? 0 : ((index % count) + count) % count;
  const current = images[safeIndex];

  const pauseAutoplay = useCallback(() => {
    holdUntil.current = Date.now() + AUTO_MS;
    setHold((n) => n + 1);
  }, []);

  function manualStep(delta: number) {
    if (count < 2) return;
    manualAnnounce.current = true;
    pauseAutoplay();
    step(delta);
  }

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

  useEffect(() => {
    if (!manualAnnounce.current) return;
    manualAnnounce.current = false;
    const image = images[safeIndex];
    if (!image) return;
    const labelText = image.alt || `Photo ${safeIndex + 1}`;
    setAnnouncement(`Photo ${safeIndex + 1} of ${count}. ${labelText}`);
  }, [count, images, safeIndex]);

  useEffect(() => {
    if (count < 2) return;
    const root = rootRef.current;
    if (!root) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer = 0;
    let onScreen = false;

    function clearTimer() {
      window.clearTimeout(timer);
      timer = 0;
    }

    function queue() {
      clearTimer();
      if (media.matches || document.hidden || !onScreen || touching.current) return;
      const wait = Math.max(AUTO_MS, holdUntil.current - Date.now());
      timer = window.setTimeout(() => {
        if (touching.current || document.hidden || media.matches) return;
        setIndex((currentIndex) => (currentIndex + 1) % count);
      }, wait);
    }

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      queue();
    });
    observer.observe(root);
    document.addEventListener("visibilitychange", queue);
    media.addEventListener("change", queue);
    queue();

    return () => {
      clearTimer();
      observer.disconnect();
      document.removeEventListener("visibilitychange", queue);
      media.removeEventListener("change", queue);
    };
  }, [count, hold, safeIndex]);

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
      manualStep(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      manualStep(-1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || count < 2) return;
    if ((event.target as HTMLElement).closest("button")) return;
    touching.current = true;
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
    const wasTouching = touching.current;
    swipe.current = null;
    touching.current = false;
    if (!start || start.id !== event.pointerId) {
      if (wasTouching) pauseAutoplay();
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) {
      pauseAutoplay();
      return;
    }
    manualStep(dx < 0 ? 1 : -1);
  }

  if (!current) return null;

  const alt = current.alt || `Photo ${safeIndex + 1}`;
  const position = `${safeIndex + 1} / ${count}`;

  return (
    <div
      ref={rootRef}
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
          if (touching.current) {
            touching.current = false;
            pauseAutoplay();
          }
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
            <button
              type="button"
              className="arrow prev"
              onClick={() => manualStep(-1)}
              aria-label="Previous photo"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              className="arrow next"
              onClick={() => manualStep(1)}
              aria-label="Next photo"
            >
              <Chevron dir="right" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <>
          <p className="sr-only" aria-live="polite">
            {announcement}
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
                onClick={() => {
                  pauseAutoplay();
                  if (i !== safeIndex) {
                    manualAnnounce.current = true;
                    show(i);
                  }
                }}
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
