"use client";

import { useEffect, useRef, useState } from "react";
import { MILE_THRESHOLD, SHOP_ADDRESS } from "@/lib/booking-rules";
import { mapEmbedSrc } from "@/lib/map-embed";
import { mountShopMap, type ShopMapApi } from "@/lib/shop-map";

type MapsWindow = Window & {
  google?: { maps?: ShopMapApi };
  gm_authFailure?: () => void;
};

let mapsLoader: Promise<void> | null = null;

function loadMaps(apiKey: string) {
  const existing = (window as MapsWindow).google?.maps;
  if (existing) return Promise.resolve();
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoader = null;
      reject(new Error("Google Maps did not load."));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

export function ServiceAreaMap({ apiKey }: { apiKey: string }) {
  const node = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(apiKey ? "loading" : "unavailable");

  useEffect(() => {
    if (!apiKey || !node.current) return;
    let cancel = false;
    const host = window as MapsWindow;
    host.gm_authFailure = () => {
      if (!cancel) setStatus("unavailable");
    };
    loadMaps(apiKey)
      .then(() => {
        if (cancel || !node.current) return;
        const maps = host.google?.maps;
        if (!maps) {
          setStatus("unavailable");
          return;
        }
        mountShopMap(node.current, maps);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancel) setStatus("unavailable");
      });
    return () => {
      cancel = true;
    };
  }, [apiKey]);

  const label = `Map of Chance Classics at ${SHOP_ADDRESS} with a ${MILE_THRESHOLD}-mile free mileage zone`;

  return (
    <figure className="area-map">
      <div className="area-map-frame">
        <div
          ref={node}
          className="area-map-canvas"
          role="region"
          aria-label={label}
          hidden={status === "unavailable"}
        />
        {status === "loading" && <p className="area-map-status">Loading the map…</p>}
        {status === "unavailable" && (
          <iframe
            className="area-map-embed"
            title={label}
            src={mapEmbedSrc(SHOP_ADDRESS)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
      </div>
      {status === "ready" && (
        <figcaption>The circle is the {MILE_THRESHOLD}-mile free mileage zone around {SHOP_ADDRESS}.</figcaption>
      )}
      {status === "unavailable" && <figcaption>Chance Classics at {SHOP_ADDRESS}.</figcaption>}
    </figure>
  );
}
