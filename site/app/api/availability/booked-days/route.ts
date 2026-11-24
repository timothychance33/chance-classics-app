import { NextResponse } from "next/server";
import {
  QUOTE_BOOKED_HORIZON_DAYS,
  addDays,
  chicagoDate,
  matchQuoteServiceCar,
} from "@/lib/booking-rules";
import { fleetTag, serviceBySlug, services } from "@/lib/content";
import { rentalDb } from "@/lib/rental-db";
import { bookedDaysForCar, carIdForName } from "@/lib/site-booking";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function carNameFromQuery(service: string, car: string) {
  const slug = serviceBySlug(car);
  if (slug) return slug.car;
  if (service) {
    const fromCatalog = services.find((item) => {
      const label = fleetTag(item.car, `${item.car} - ${item.name}`);
      return label === service || item.car.toLowerCase() === service.toLowerCase();
    });
    if (fromCatalog) return fromCatalog.car;
  }
  if (car) {
    const fromCatalog = services.find((item) => item.car.toLowerCase() === car.toLowerCase());
    if (fromCatalog) return fromCatalog.car;
  }
  return "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const service = url.searchParams.get("service") || "";
  const car = url.searchParams.get("car") || "";
  const today = chicagoDate();
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || addDays(from, QUOTE_BOOKED_HORIZON_DAYS);
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  }
  if (addDays(from, 800) < to) {
    return NextResponse.json({ error: "That date range is too long." }, { status: 400 });
  }

  const catalogName = carNameFromQuery(service, car);
  const label = service || catalogName || car;
  if (!label.trim()) {
    return NextResponse.json({ error: "Choose a car." }, { status: 400 });
  }

  const db = rentalDb();
  if (!db) {
    return NextResponse.json({
      connected: false,
      dates: [],
      message: "The live calendar isn’t connected on this preview yet, so booked days can’t be checked.",
    });
  }

  try {
    const cars = await db.from("cars").select("id,name");
    if (cars.error) throw new Error(cars.error.message);
    const hit = matchQuoteServiceCar(label, cars.data)
      || (catalogName ? matchQuoteServiceCar(catalogName, cars.data) : null);
    const carId = hit?.id ? String(hit.id) : catalogName ? await carIdForName(db, catalogName) : null;
    if (!carId) {
      return NextResponse.json({
        connected: true,
        dates: [],
        error: "That car is not on the garage calendar yet.",
      });
    }
    const dates = await bookedDaysForCar(db, carId, from, to);
    return NextResponse.json({ connected: true, dates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar lookup failed.";
    return NextResponse.json({ connected: false, dates: [], message }, { status: 500 });
  }
}
