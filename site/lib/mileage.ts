import { MILEAGE_REVIEW_TEXT, SHOP_ADDRESS, mileageCharge } from "@/lib/booking-rules";

const METERS_PER_MILE = 1609.344;

export type MileageQuote = {
  needsReview: boolean;
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

export function mileageMessage(charge: { miles: number; fee: number }) {
  const distance = `${charge.miles} miles from Benton to pickup.`;
  if (charge.fee <= 0) return `${distance} No mileage fee.`;
  return `${distance} Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage(): MileageQuote {
  return { needsReview: true, miles: null, fee: null, message: MILEAGE_REVIEW_TEXT };
}

function endpoint(placeId: string | undefined, address: string | undefined) {
  const id = placeId?.trim();
  if (id) return `place_id:${id}`;
  return address?.trim() || "";
}

export async function quoteDrivingMileage(input: {
  pickupPlaceId?: string;
  pickup?: string;
}): Promise<MileageQuote> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return reviewMileage();
  const pickup = endpoint(input.pickupPlaceId, input.pickup);
  if (pickup.length < 4) return reviewMileage();

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", SHOP_ADDRESS);
  url.searchParams.set("destinations", pickup);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", key);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    const miles = legMiles(body, 0, 0);
    if (miles == null) return reviewMileage();
    const charge = mileageCharge(miles);
    return {
      needsReview: false,
      miles: charge.miles,
      fee: charge.fee,
      message: mileageMessage(charge),
    };
  } catch {
    return reviewMileage();
  }
}
