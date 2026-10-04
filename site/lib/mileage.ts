import { MILEAGE_REVIEW_TEXT, MILEAGE_TRIP, SHOP_ADDRESS, mileageCharge } from "@/lib/booking-rules";

const METERS_PER_MILE = 1609.344;

export type MileageQuote = {
  needsReview: boolean;
  miles: number | null;
  fee: number | null;
  message: string;
};

export function oneWayMilesFromDistanceMatrix(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const record = body as {
    status?: string;
    rows?: { elements?: { status?: string; distance?: { value?: number } }[] }[];
  };
  if (record.status !== "OK") return null;
  const element = record.rows?.[0]?.elements?.[0];
  if (element?.status !== "OK" || typeof element.distance?.value !== "number") return null;
  if (element.distance.value < 0) return null;
  return element.distance.value / METERS_PER_MILE;
}

export function mileageMessage(charge: { miles: number; fee: number }) {
  if (charge.fee <= 0) return `${charge.miles} miles from Benton. No mileage fee.`;
  return `${charge.miles} miles from Benton. Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage(): MileageQuote {
  return { needsReview: true, miles: null, fee: null, message: MILEAGE_REVIEW_TEXT };
}

export async function quoteDrivingMileage(input: { placeId?: string; address?: string }): Promise<MileageQuote> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return reviewMileage();
  const destination = input.placeId ? `place_id:${input.placeId}` : input.address?.trim() || "";
  if (destination.length < 4) return reviewMileage();

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", SHOP_ADDRESS);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", key);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    const oneWay = oneWayMilesFromDistanceMatrix(body);
    if (oneWay == null) return reviewMileage();
    const charge = mileageCharge(oneWay, MILEAGE_TRIP);
    return { needsReview: false, miles: charge.miles, fee: charge.fee, message: mileageMessage(charge) };
  } catch {
    return reviewMileage();
  }
}
