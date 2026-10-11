import { NextResponse } from "next/server";
import { BASE_HOURS, earliestBookableDate } from "@/lib/booking-rules";
import { rentalDb } from "@/lib/rental-db";
import { carIdForName, openTimesForCar } from "@/lib/site-booking";
import { serviceBySlug } from "@/lib/content";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("car") || "";
  const date = url.searchParams.get("date") || "";
  const hours = Number(url.searchParams.get("hours") || String(BASE_HOURS));
  const service = serviceBySlug(slug);
  if (!service) return NextResponse.json({ error: "Unknown car." }, { status: 404 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Choose a date." }, { status: 400 });
  }
  if (!Number.isInteger(hours) || hours < BASE_HOURS || hours > 8) {
    return NextResponse.json({ error: "Choose at least 2 whole hours." }, { status: 400 });
  }
  if (date < earliestBookableDate()) {
    return NextResponse.json({
      connected: true,
      slots: [],
      error: "Reservations must be made at least 7 days in advance.",
    });
  }

  const db = rentalDb();
  if (!db) {
    return NextResponse.json({
      connected: false,
      slots: [],
      message: "The live calendar isn’t connected on this preview yet, so open times can’t be checked.",
    });
  }

  try {
    const carId = await carIdForName(db, service.car);
    if (!carId) {
      return NextResponse.json({
        connected: true,
        slots: [],
        error: `${service.car} is not on the garage calendar yet.`,
      });
    }
    const slots = await openTimesForCar(db, carId, date, hours);
    return NextResponse.json({ connected: true, slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar lookup failed.";
    return NextResponse.json({ connected: false, slots: [], message }, { status: 500 });
  }
}
