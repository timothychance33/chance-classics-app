// Benton-to-pickup mileage. Same rule as Book Online (site/lib/booking-rules.ts
// and site/lib/mileage.ts). The garage calls this from the quote-mileage
// edge function so the Maps key never reaches the browser.

export const SHOP_ADDRESS = "118 5th St E, Benton, LA 71006";
export const FREE_MILES = 30;
export const PER_MILE = 3;
export const MILEAGE_REVIEW_TEXT = "We'll confirm mileage.";

const METERS_PER_MILE = 1609.344;
const DISTANCE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

function wholeMiles(value) {
  return Math.ceil(value - 1e-6);
}

/** Round the Benton-to-pickup drive up. 30 miles or less is free. Over 30, the fee is $3 times that full distance. */
export function mileageCharge(pickupMiles) {
  const miles = wholeMiles(pickupMiles);
  const fee = miles > FREE_MILES ? miles * PER_MILE : 0;
  return { miles, fee };
}

export function mileageMessage(charge) {
  const distance = `${charge.miles} miles from Benton to pickup.`;
  if (charge.fee <= 0) return `${distance} No mileage fee.`;
  return `${distance} Mileage fee $${charge.fee}, billed with the balance.`;
}

export function reviewMileage() {
  return { needsReview: true, miles: null, fee: null, message: MILEAGE_REVIEW_TEXT };
}

/** Miles for the Benton-to-pickup element. Only a ROUTE_EXISTS result counts. */
export function routeMatrixMiles(body) {
  const elements = Array.isArray(body) ? body : [];
  const element = elements.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item.originIndex ?? 0) === 0 && (item.destinationIndex ?? 0) === 0;
  });
  if (!element || element.condition !== "ROUTE_EXISTS") return null;
  if (typeof element.distanceMeters !== "number" || !Number.isFinite(element.distanceMeters) || element.distanceMeters < 0) {
    return null;
  }
  return element.distanceMeters / METERS_PER_MILE;
}

export function destinationWaypoint(pickupPlaceId, pickup) {
  const address = String(pickup ?? "").trim();
  if (address.length >= 4) return { address };
  const placeId = String(pickupPlaceId ?? "").trim();
  if (placeId) return { placeId };
  return null;
}

export function distanceMatrixBody(waypoint) {
  return {
    origins: [{ waypoint: { address: SHOP_ADDRESS } }],
    destinations: [{ waypoint }],
    travelMode: "DRIVE",
  };
}

/**
 * Driving miles from the Benton shop to the pickup.
 * options.apiKey is GOOGLE_MAPS_API_KEY. options.fetch is injectable in tests.
 * A missing key, a short address, or a failed route returns the review quote.
 */
export async function quoteDrivingMileage(input, options = {}) {
  const key = options.apiKey ?? "";
  const doFetch = options.fetch ?? fetch;
  if (!key) return reviewMileage();
  const waypoint = destinationWaypoint(input?.pickupPlaceId, input?.pickup);
  if (!waypoint) return reviewMileage();

  try {
    const response = await doFetch(DISTANCE_MATRIX_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,status,condition",
      },
      body: JSON.stringify(distanceMatrixBody(waypoint)),
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
