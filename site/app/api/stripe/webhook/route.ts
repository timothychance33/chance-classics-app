import { NextResponse } from "next/server";
import Stripe from "stripe";
import { validateDayOfContact } from "@/lib/booking-rules";
import { confirmedDepositUpdate, depositDollarsFromSession, totalDollarsFromCheckout } from "@/lib/deposit-payment";
import { confirmPaidQuote } from "@/lib/quote-booking";
import { rentalDb } from "@/lib/rental-db";
import { updateBooking } from "@/lib/site-booking";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: "Payments aren’t connected yet." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const stripe = new Stripe(secret);
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, pending: true });
  }
  const db = rentalDb();
  if (!db) return NextResponse.json({ error: "Calendar isn’t connected." }, { status: 503 });

  const quoteId = session.metadata?.quote_id;
  if (quoteId && !session.metadata?.booking_id) {
    try {
      const dayOf = validateDayOfContact({
        name: session.metadata?.day_of_contact_name,
        phone: session.metadata?.day_of_contact_phone,
        role: session.metadata?.day_of_contact_role,
      });
      const confirmed = await confirmPaidQuote(db, quoteId, {
        stripeSecret: secret,
        vercelEnv: process.env.VERCEL_ENV,
      }, dayOf.ok ? dayOf.value : null, session.id);
      if (!confirmed.ok && "error" in confirmed && confirmed.status >= 400) {
        return NextResponse.json({ error: confirmed.error }, { status: confirmed.status });
      }
      return NextResponse.json({ received: true, ...confirmed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The quote booking could not be saved.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const bookingId = session.metadata?.booking_id || session.client_reference_id;
  if (!bookingId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });

  const columns = "id,status,notes,car_id,payment_status,total_usd,amount_paid_usd,mileage_fee_usd,stripe_deposit_session_id";
  let existing = await db.from("bookings").select(columns).eq("id", bookingId).maybeSingle();
  let includeSessionId = true;
  if (existing.error && /stripe_deposit_session_id/i.test(existing.error.message || "")) {
    includeSessionId = false;
    existing = await db.from("bookings").select(
      "id,status,notes,car_id,payment_status,total_usd,amount_paid_usd,mileage_fee_usd",
    ).eq("id", bookingId).maybeSingle();
  }
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (existing.data.status === "cancelled") {
    return NextResponse.json({ error: "This hold expired before payment." }, { status: 409 });
  }

  const row = existing.data;
  const patch = confirmedDepositUpdate({
    status: row.status,
    paymentStatus: row.payment_status,
    existingTotal: row.total_usd == null ? null : Number(row.total_usd),
    existingPaid: row.amount_paid_usd == null ? null : Number(row.amount_paid_usd),
    existingSessionId: includeSessionId ? row.stripe_deposit_session_id : null,
    totalUsd: totalDollarsFromCheckout({
      metadata: session.metadata,
      notes: row.notes,
      mileageFeeUsd: row.mileage_fee_usd == null ? null : Number(row.mileage_fee_usd),
    }),
    depositUsd: depositDollarsFromSession(session),
    sessionId: session.id,
    notes: row.notes,
    includeSessionId,
  });
  const updated = await updateBooking(db, bookingId, patch);
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });

  const carId = updated.data.car_id;
  if (carId) {
    const have = await db.from("booking_prep_tasks").select("id").eq("booking_id", bookingId).limit(1);
    if (!have.error && !(have.data || []).length) {
      const template = await db.from("car_prep_templates").select("task,sort_order").eq("car_id", carId);
      if (!template.error && template.data?.length) {
        await db.from("booking_prep_tasks").insert(
          template.data.map((task) => ({
            booking_id: bookingId,
            task: task.task,
            sort_order: task.sort_order,
          })),
        );
      }
    }
  }

  return NextResponse.json({ received: true, confirmed: true });
}
