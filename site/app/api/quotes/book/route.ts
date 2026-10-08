import { NextResponse } from "next/server";
import Stripe from "stripe";
import { QUOTE_LINK_EXPIRED, bookingSource, quoteCheckoutMoney, stripeReady, validateDayOfContact } from "@/lib/booking-rules";
import {
  carNameFor,
  loadQuoteByToken,
  publicQuoteView,
  quoteIsOpen,
  quoteTimeFree,
} from "@/lib/quote-booking";
import { rentalDb } from "@/lib/rental-db";

function tokenOf(value: string) {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(token)) return "";
  return token;
}

export async function GET(request: Request) {
  const token = tokenOf(new URL(request.url).searchParams.get("token") || "");
  if (!token) return NextResponse.json({ ok: false, message: QUOTE_LINK_EXPIRED }, { status: 404 });
  const db = rentalDb();
  if (!db) return NextResponse.json({ ok: false, message: "We'll confirm this quote. Call or text (318) 344-5001." }, { status: 503 });
  try {
    const quote = await loadQuoteByToken(db, token);
    const open = quoteIsOpen(quote);
    if (!quote || !open.ok) return NextResponse.json({ ok: false, message: QUOTE_LINK_EXPIRED });
    const carName = await carNameFor(db, quote.car_id, quote.service_name);
    const slot = await quoteTimeFree(db, quote);
    return NextResponse.json({
      ok: true,
      available: slot.ok,
      availability: slot.ok ? "" : slot.error,
      quote: publicQuoteView(quote, carName),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote could not be loaded.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The form could not be read." }, { status: 400 });
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = tokenOf(String(raw.token || ""));
  if (!token) return NextResponse.json({ error: QUOTE_LINK_EXPIRED }, { status: 404 });
  if (raw.waiver !== true) return NextResponse.json({ error: "Accept the rental terms to continue." }, { status: 400 });
  if (raw.reliability !== true) return NextResponse.json({ error: "Accept the classic-car reliability notice to continue." }, { status: 400 });
  const dayOf = validateDayOfContact({
    name: String(raw.dayOfName || ""),
    phone: String(raw.dayOfPhone || ""),
    role: String(raw.dayOfRole || ""),
  });
  if (!dayOf.ok) return NextResponse.json({ error: dayOf.error }, { status: 400 });

  const db = rentalDb();
  if (!db) {
    return NextResponse.json({ error: "The booking calendar isn’t connected on this preview yet. Nothing was reserved." }, { status: 503 });
  }
  const quote = await loadQuoteByToken(db, token);
  const open = quoteIsOpen(quote);
  if (!quote || !open.ok) return NextResponse.json({ error: QUOTE_LINK_EXPIRED }, { status: 409 });
  const slot = await quoteTimeFree(db, quote);
  if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: 409 });

  const payments = stripeReady({
    secret: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
    publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  const carName = await carNameFor(db, quote.car_id, quote.service_name);
  const money = quoteCheckoutMoney(Number(quote.total) || 0);
  if (!payments) {
    return NextResponse.json({
      code: "payments_not_connected",
      error: "Payments aren’t connected yet. Nothing was charged and this time was not reserved.",
      deposit: money.deposit,
      balance: money.balance,
      total: money.total,
    });
  }
  if (money.deposit <= 0) {
    return NextResponse.json({ error: "This quote does not have an amount to collect." }, { status: 400 });
  }

  const source = bookingSource({
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  });
  const origin = new URL(request.url).origin;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: quote.customer_email || undefined,
      client_reference_id: quote.id,
      metadata: {
        quote_id: quote.id,
        book_token: token,
        source,
        car: carName,
        day_of_contact_name: dayOf.value.name,
        day_of_contact_phone: dayOf.value.phone,
        day_of_contact_role: dayOf.value.role,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(money.deposit * 100),
            product_data: {
              name: `$${money.deposit} non-refundable deposit — ${carName}`,
              description: `${carName}, ${quote.event_date} ${slot.start}–${slot.end}. Quote total $${money.total}. Balance $${money.balance} is billed separately. The car is reserved after this payment is confirmed.`,
            },
          },
        },
      ],
      success_url: `${origin}/booking/confirmed/`,
      cancel_url: `${origin}/book/quote/${token}/`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be opened.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
