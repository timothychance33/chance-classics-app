import { MILEAGE_REVIEW_TEXT, SHOP_ADDRESS, mileageCharge } from "@/lib/booking-rules";

const METERS_PER_MILE = 1609.344;

export type MileageQuote = {
  needsReview: boolean;
  miles: number | null;
  fee: number | null;
  driveMinutes: number | null;
  message: string;
};

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: unknown;
  condition?: string;
};

function routeMatrixElement(body: unknown): MatrixElement | null {
  const elements: unknown[] = Array.isArray(body) ? body : [];
  const element = elements.find((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as MatrixElement;
    return (row.originIndex ?? 0) === 0 && (row.destinationIndex ?? 0) === 0;
  });
  return (element as MatrixElement | undefined) || null;
}

/** Miles for the Benton-to-pickup element. Only a ROUTE_EXISTS result counts. */
export function routeMatrixMiles(body: unknown): number | null {
  const element = routeMatrixElement(body);
  if (!element || element.condition !== "ROUTE_EXISTS") return null;
  if (typeof element.distanceMeters !== "number" || !Number.isFinite(element.distanceMeters) || element.distanceMeters < 0) {
    return null;
  }
  return element.distanceMeters / METERS_PER_MILE;
}

/** Whole minutes for that same drive, rounded up. Missing duration is null, not a failed route. */
export function routeMatrixDriveMinutes(body: unknown): number | null {
  const element = routeMatrixElement(body);
  if (!element || element.condition !== "ROUTE_EXISTS") return null;
  return durationMinutes(element.duration);
}

function durationMinutes(duration: unknown): number | null {
  let seconds: number | null = null;
  if (typeof duration === "string") {
    const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) seconds = Number(match[1]);
  } else if (duration && typeof duration === "object" && "seconds" in duration) {
    const raw = (duration as { seconds?: unknown }).seconds;
    if (raw != null && raw !== "") seconds = Number(raw);
  }
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds / 60 - 1e-9);
}

export function mileageMessage(charge: { miles: number; fee: number }) {
  const distance = `${charge.miles} miles from Benton to pickup.`;
  if (charge.fee <= 0) return `${distance} No mileage fee.`;
  return `${distance} Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage(): MileageQuote {
  return { needsReview: true, miles: null, fee: null, driveMinutes: null, message: MILEAGE_REVIEW_TEXT };
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
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,status,condition",
      },
      body: JSON.stringify({
        origins: [{ waypoint: { address: SHOP_ADDRESS } }],
        destinations: [{ waypoint }],
        travelMode: "DRIVE",
      }),
    });
    if (!response.ok) return reviewMileage();
    const body = await response.json();
    const miles = routeMatrixMiles(body);
    if (miles == null) return reviewMileage();
    const charge = mileageCharge(miles);
    return {
      needsReview: false,
      miles: charge.miles,
      fee: charge.fee,
      driveMinutes: routeMatrixDriveMinutes(body),
      message: mileageMessage(charge),
    };
  } catch {
    return reviewMileage();
  }
}
