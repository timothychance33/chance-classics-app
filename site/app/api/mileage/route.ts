import { NextResponse } from "next/server";
import { quoteDrivingMileage } from "@/lib/mileage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId")?.trim() || "";
  const address = url.searchParams.get("address")?.trim() || "";
  const quote = await quoteDrivingMileage({
    placeId: placeId.slice(0, 300),
    address: address.slice(0, 300),
  });
  return NextResponse.json(quote);
}
