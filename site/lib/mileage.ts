import { MILEAGE_REVIEW_TEXT, SHOP_ADDRESS, mileageCharge } from "@/lib/booking-rules";

const METERS_PER_MILE = 1609.344;

export type MileageQuote = {
  needsReview: boolean;
  toPickup: number | null;
  between: number | null;
  miles: number | null;
  fee: number | null;
  message: string;
};

type MatrixBody = {
  status?: string;
  rows?: { elements?: { status?: string; distance?: { value?: number } }[] }[];
};

export function legMiles(body: unknown, row: number, col: number): number | null {
  if (!body || typeof body !== "object") return null;
  const record = body as MatrixBody;
  if (record.status !== "OK") return null;
  const element = record.rows?.[row]?.elements?.[col];
  if (element?.status !== "OK" || typeof element.distance?.value !== "number") return null;
  if (element.distance.value < 0) return null;
  return element.distance.value / METERS_PER_MILE;
}

export function mileageMessage(charge: { toPickup: number; between: number; miles: number; fee: number }) {
  const legs = `Benton to pickup: ${charge.toPickup} miles. Pickup to drop-off: ${charge.between} miles. Total: ${charge.miles} miles.`;
  if (charge.fee <= 0) return `${legs} No mileage fee.`;
  return `${legs} Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage(): MileageQuote {
  return { needsReview: true, toPickup: null, between: null, miles: null, fee: null, message: MILEAGE_REVIEW_TEXT };
}

function endpoint(placeId: string | undefined, address: string | undefined) {
  const id = placeId?.trim();
  if (id) return `place_id:${id}`;
  return address?.trim() || "";
}

export async function quoteDrivingMileage(input: {
  pickupPlaceId?: string;
  pickup?: string;
  dropoffPlaceId?: string;
  dropoff?: string;
}): Promise<MileageQuote> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return reviewMileage();
  const pickup = endpoint(input.pickupPlaceId, input.pickup);
  const dropoff = endpoint(input.dropoffPlaceId, input.dropoff);
  if (pickup.length < 4 || dropoff.length < 4) return reviewMileage();

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${SHOP_ADDRESS}|${pickup}`);
  url.searchParams.set("destinations", `${pickup}|${dropoff}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", key);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    const toPickup = legMiles(body, 0, 0);
    const between = legMiles(body, 1, 1);
    if (toPickup == null || between == null) return reviewMileage();
    const charge = mileageCharge(toPickup, between);
    return {
      needsReview: false,
      toPickup: charge.toPickup,
      between: charge.between,
      miles: charge.miles,
      fee: charge.fee,
      message: mileageMessage(charge),
    };
  } catch {
    return reviewMileage();
  }
}
