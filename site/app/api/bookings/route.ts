import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  bookingSource,
  quoteTotal,
  rangesOverlap,
  stripeReady,
  toMinutes,
  validateBooking,
} from "@/lib/booking-rules";
import { serviceBySlug } from "@/lib/content";
import { rentalDb } from "@/lib/rental-db";
import { busyRanges, carIdForName, releaseStaleHolds } from "@/lib/site-booking";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The form could not be read." }, { status: 400 });
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const parsed = validateBooking({
    car: String(raw.car || ""),
    date: String(raw.date || ""),
    start: String(raw.start || ""),
    hours: Number(raw.hours),
    name: String(raw.name || ""),
    email: String(raw.email || ""),
    phone: String(raw.phone || ""),
    occasion: String(raw.occasion || ""),
    pickup: String(raw.pickup || ""),
    dropoff: String(raw.dropoff || ""),
    waiver: raw.waiver === true,
    reliability: raw.reliability === true,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;
  const service = serviceBySlug(value.car);
  if (!service) return NextResponse.json({ error: "Unknown car." }, { status: 404 });

  const source = bookingSource({
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  });
  const money = quoteTotal(service.price, value.hours);
  const payments = stripeReady({
    secret: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
    publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  if (!payments) {
    return NextResponse.json({
      code: "payments_not_connected",
      error: "Payments aren’t connected yet. Nothing was charged and this time was not reserved.",
      total: money.total,
      deposit: money.deposit,
    });
  }

  const db = rentalDb();
  if (!db) {
    return NextResponse.json({
      code: "calendar_not_connected",
      error: "The booking calendar isn’t connected on this preview yet. Nothing was reserved.",
    }, { status: 503 });
  }

  try {
    const carId = await carIdForName(db, service.car);
    if (!carId) {
      return NextResponse.json({ error: `${service.car} is not on the garage calendar yet.` }, { status: 409 });
    }
    await releaseStaleHolds(db, carId);
    const busy = await busyRanges(db, carId, value.date);
    const start = toMinutes(value.start)!;
    const end = toMinutes(value.end)!;
    const clash = busy.some((item) => {
      const a = toMinutes(item.start);
      const b = toMinutes(item.end);
      return a != null && b != null && rangesOverlap(start, end, a, b);
    });
    if (clash) {
      return NextResponse.json({ error: "That time was just taken. Pick another open time." }, { status: 409 });
    }

    const notes = [
      source === "site-test" ? "TEST website booking. Not a real garage job until you say so." : "Website booking.",
      `Car: ${service.car} (${service.name})`,
      `Occasion: ${value.occasion}`,
      `Duration: ${value.hours} hours`,
      `Listing total: $${money.total}`,
      `Deposit due: $${money.deposit}`,
      `Balance billed separately: $${money.balance}`,
      "Waiver accepted: Yes",
      "Vehicle reliability acknowledged: Yes",
      `Confirmed only after the $${money.deposit} deposit is paid.`,
    ].join("\n");

    const inserted = await db
      .from("bookings")
      .insert({
        customer_name: value.name,
        customer_email: value.email,
        customer_phone: value.phone,
        event_type: value.occasion,
        event_date: value.date,
        start_time: value.start,
        end_time: value.end,
        pickup_location: value.pickup,
        return_location: value.dropoff,
        car_id: carId,
        status: "hold",
        payment_status: "unpaid",
        source,
        notes,
      })
      .select("id")
      .single();

    if (inserted.error || !inserted.data) {
      const code = inserted.error?.code;
      if (code === "23P01") {
        return NextResponse.json({ error: "That time was just taken. Pick another open time." }, { status: 409 });
      }
      throw new Error(inserted.error?.message || "The booking could not be saved.");
    }

    const bookingId = String(inserted.data.id);
    const origin = new URL(request.url).origin;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: value.email,
        client_reference_id: bookingId,
        metadata: { booking_id: bookingId, source, car: service.car },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: money.deposit * 100,
              product_data: {
                name: `$${money.deposit} non-refundable deposit — ${service.car}`,
                description: `${service.name}, ${value.date} ${value.start}–${value.end}. Listing total $${money.total}.`,
              },
            },
          },
        ],
        success_url: `${origin}/booking/confirmed/`,
        cancel_url: `${origin}/service-page/${service.slug}/?booking=cancelled#book`,
      });
      if (!session.url) throw new Error("Stripe did not return a checkout link.");
      return NextResponse.json({ ok: true, url: session.url, source });
    } catch (error) {
      await db.from("bookings").update({
        status: "cancelled",
        notes: "Website hold cancelled because checkout could not be opened.",
      }).eq("id", bookingId);
      const message = error instanceof Error ? error.message : "Checkout could not be opened.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The booking could not be saved.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
