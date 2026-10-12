/** Same address and 30-mile rule as SHOP_ADDRESS and MILE_THRESHOLD in booking-rules.ts. */
export const SHOP_ADDRESS_LABEL = "118 5th St E, Benton, LA 71006";
export const FREE_MILE_RADIUS = 30;

/**
 * Census Bureau geocoder match for 118 5th St, Benton, LA 71006
 * (Public Address Ranges, current benchmark).
 */
export const SHOP_POINT = { lat: 32.698059983295, lng: -93.740844023622 };
export const METERS_PER_MILE = 1609.344;

export function freeMileageRadiusMeters() {
  return FREE_MILE_RADIUS * METERS_PER_MILE;
}

export type ShopMapApi = {
  Map: new (el: HTMLElement, opts: object) => { fitBounds: (bounds: object, padding?: number) => void };
  Marker: new (opts: object) => unknown;
  Circle: new (opts: object) => { getBounds: () => object | null | undefined };
};

/** Pin the shop and draw the free-mileage circle. The circle uses the same 30-mile rule as the mileage copy. */
export function mountShopMap(el: HTMLElement, maps: ShopMapApi) {
  const center = SHOP_POINT;
  const map = new maps.Map(el, {
    center,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "cooperative",
    clickableIcons: false,
  });
  new maps.Marker({
    map,
    position: center,
    title: `Chance Classics, ${SHOP_ADDRESS_LABEL}`,
  });
  const circle = new maps.Circle({
    map,
    center,
    radius: freeMileageRadiusMeters(),
    geodesic: true,
    strokeColor: "#1b1a21",
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: "#1d67cd",
    fillOpacity: 0.16,
    clickable: false,
  });
  const bounds = circle.getBounds();
  if (bounds) map.fitBounds(bounds, 24);
  return { map, circle };
}
