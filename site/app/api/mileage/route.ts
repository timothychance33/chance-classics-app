import { NextResponse } from "next/server";
import { quoteDrivingMileage } from "@/lib/mileage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const quote = await quoteDrivingMileage({
    pickupPlaceId: (url.searchParams.get("pickupPlaceId") || "").slice(0, 300),
    pickup: (url.searchParams.get("pickup") || url.searchParams.get("address") || "").slice(0, 300),
    dropoffPlaceId: (url.searchParams.get("dropoffPlaceId") || "").slice(0, 300),
    dropoff: (url.searchParams.get("dropoff") || "").slice(0, 300),
  });
  return NextResponse.json(quote);
}
