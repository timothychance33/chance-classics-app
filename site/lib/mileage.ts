import { MILEAGE_REVIEW_TEXT, SHOP_ADDRESS, mileageCharge } from "@/lib/booking-rules";

const METERS_PER_MILE = 1609.344;

export type MileageQuote = {
  needsReview: boolean;
  miles: number | null;
  fee: number | null;
  message: string;
};

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  condition?: string;
};

/** Miles for the Benton-to-pickup element. Only a ROUTE_EXISTS result counts. */
export function routeMatrixMiles(body: unknown): number | null {
  const elements: unknown[] = Array.isArray(body) ? body : [];
  const element = elements.find((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as MatrixElement;
    return (row.originIndex ?? 0) === 0 && (row.destinationIndex ?? 0) === 0;
  }) as MatrixElement | undefined;
  if (!element || element.condition !== "ROUTE_EXISTS") return null;
  if (typeof element.distanceMeters !== "number" || !Number.isFinite(element.distanceMeters) || element.distanceMeters < 0) {
    return null;
  }
  return element.distanceMeters / METERS_PER_MILE;
}

export function mileageMessage(charge: { miles: number; fee: number }) {
  const distance = `${charge.miles} miles from Benton to pickup.`;
  if (charge.fee <= 0) return `${distance} No mileage fee.`;
  return `${distance} Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage(): MileageQuote {
  return { needsReview: true, miles: null, fee: null, message: MILEAGE_REVIEW_TEXT };
}

function destinationWaypoint(pickupPlaceId: string | undefined, pickup: string | undefined) {
  const address = pickup?.trim() || "";
  if (address.length >= 4) return { address };
  const placeId = pickupPlaceId?.trim();
  if (placeId) return { placeId };
  return null;
}

export async function quoteDrivingMileage(input: {
  pickupPlaceId?: string;
  pickup?: string;
}): Promise<MileageQuote> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return reviewMileage();
  const waypoint = destinationWaypoint(input.pickupPlaceId, input.pickup);
  if (!waypoint) return reviewMileage();

  try {
    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,status,condition",
      },
      body: JSON.stringify({
        origins: [{ waypoint: { address: SHOP_ADDRESS } }],
        destinations: [{ waypoint }],
        travelMode: "DRIVE",
      }),
    });
    if (!response.ok) return reviewMileage();
    const miles = routeMatrixMiles(await response.json());
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
