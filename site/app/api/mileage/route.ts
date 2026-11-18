import { NextResponse } from "next/server";
import { quoteDrivingMileage, quoteDropoffMileage } from "@/lib/mileage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pickupPlaceId = (url.searchParams.get("pickupPlaceId") || "").slice(0, 300);
  const pickup = (url.searchParams.get("pickup") || url.searchParams.get("address") || "").slice(0, 300);
  const dropoffPlaceId = (url.searchParams.get("dropoffPlaceId") || "").slice(0, 300);
  const dropoff = (url.searchParams.get("dropoff") || "").slice(0, 300);
  const quote = await quoteDrivingMileage({ pickupPlaceId, pickup });
  const dropoffQuote = await quoteDropoffMileage({ pickup, pickupPlaceId, dropoff, dropoffPlaceId });
  return NextResponse.json({ ...quote, dropoff: dropoffQuote });
}
