import { NextResponse } from "next/server";
import { quoteRequestRecord } from "@/lib/booking-rules";
import { rentalDb } from "@/lib/rental-db";

function matchCar(service: string | null, cars: { id?: string; name?: string }[] | null) {
  if (!service || !Array.isArray(cars)) return null;
  const text = service.toLowerCase();
  return cars.find((car) => car?.name && text.startsWith(String(car.name).toLowerCase()))
    ?? cars.find((car) => car?.name && text.includes(String(car.name).toLowerCase()))
    ?? null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The form could not be read." }, { status: 400 });
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const heard = [String(raw.heard || ""), String(raw.heardOther || "")].filter((part) => part.trim()).join(": ");
  const record = quoteRequestRecord({
    firstName: String(raw.firstName || ""),
    lastName: String(raw.lastName || ""),
    email: String(raw.email || ""),
    phone: String(raw.phone || ""),
    service: String(raw.service || ""),
    eventType: String(raw.eventType || ""),
    when: String(raw.when || ""),
    pickup: String(raw.pickup || ""),
    dropoff: String(raw.dropoff || ""),
    details: String(raw.details || ""),
    planner: String(raw.planner || ""),
    heard,
  });
  if (record.customer_name.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.customer_email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!record.service_name) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  if (!record.event_date) return NextResponse.json({ error: "Choose a date and time." }, { status: 400 });
  if (!record.event_location || record.event_location.length < 3) {
    return NextResponse.json({ error: "Enter the pickup address." }, { status: 400 });
  }
  if (!record.details?.includes("Drop-off:")) return NextResponse.json({ error: "Enter the drop-off address." }, { status: 400 });

  const db = rentalDb();
  if (!db) {
    return NextResponse.json({
      error: "Quote requests aren’t connected on this preview yet. Nothing was saved. Call or text (318) 344-5001.",
    }, { status: 503 });
  }

  const cars = await db.from("cars").select("id,name");
  const hit = matchCar(record.service_name, cars.data);
  const row = {
    ...record,
    car_id: hit?.id ?? null,
    dropoff_location: String(raw.dropoff || "").trim() || null,
  };
  let inserted = await db.from("quote_requests").insert(row).select("id").single();
  if (inserted.error && /dropoff_location/i.test(inserted.error.message || "")) {
    const { dropoff_location, ...withoutDropoff } = row;
    void dropoff_location;
    inserted = await db.from("quote_requests").insert(withoutDropoff).select("id").single();
  }
  if (inserted.error || !inserted.data) {
    return NextResponse.json({ error: "The quote request could not be saved. Call or text (318) 344-5001." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: inserted.data.id });
}
