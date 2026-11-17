import { NextResponse } from "next/server";
import Stripe from "stripe";
import { authorizeCharge, chargeCors } from "@/lib/charge-auth";
import { bookingIsTaxExempt, customerAmountUpdate } from "@/lib/customer-amount.mjs";
import { rentalDb } from "@/lib/rental-db";
import { updateBooking } from "@/lib/site-booking";
import { supersedeStaleBalanceLinks } from "@/lib/supersede-pay-links";

export const runtime = "nodejs";

const COLUMNS = "id,status,notes,total_usd,amount_paid_usd,payment_status,stripe_balance_session_id,stripe_customer_id,tax_exempt";

function json(request: Request, body: unknown, status = 200) {
  const headers = chargeCors(request);
  headers.set("Content-Type", "application/json");
  return new NextResponse(JSON.stringify(body), { status, headers });
}

function failureText(error: unknown) {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name;
    return message.slice(0, 300);
  }
  return "The customer amount could not be saved.";
}

export async function OPTIONS(request: Request) {
  try {
    return new NextResponse(null, { status: 204, headers: chargeCors(request) });
  } catch (error) {
    console.error("bookings/customer-amount OPTIONS failed", error);
    return json(request, { error: failureText(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("bookings/customer-amount POST failed", error);
    return json(request, { error: failureText(error) }, 500);
  }
}

async function handlePost(request: Request) {
  const auth = await authorizeCharge(request);
  if (!auth.ok) return json(request, { error: auth.error }, auth.status);
  const db = rentalDb();
  if (!db) return json(request, { error: "The booking calendar isn’t connected." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "The form could not be read." }, 400);
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const bookingId = String(raw.bookingId || raw.booking_id || "").trim();
  const amount = Number(raw.amount);
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json(request, { error: "Missing booking." }, 400);
  if (!Number.isFinite(amount)) return json(request, { error: "Enter the customer amount." }, 400);

  let loaded = await db.from("bookings").select(COLUMNS).eq("id", bookingId).maybeSingle();
  if (loaded.error && /tax_exempt/i.test(loaded.error.message || "")) {
    loaded = await db.from("bookings").select(COLUMNS.replace(",tax_exempt", "")).eq("id", bookingId).maybeSingle();
  }
  if (loaded.error && /stripe_balance_session_id|stripe_customer_id/i.test(loaded.error.message || "")) {
    loaded = await db.from("bookings").select("id,status,notes,total_usd,amount_paid_usd,payment_status").eq("id", bookingId).maybeSingle();
  }
  if (loaded.error) return json(request, { error: loaded.error.message }, 500);
  if (!loaded.data) return json(request, { error: "Booking not found." }, 404);

  const row = loaded.data;
  const next = customerAmountUpdate({
    amount,
    paid: row.amount_paid_usd,
    taxExempt: bookingIsTaxExempt(row),
    notes: row.notes,
  });
  if ("error" in next) return json(request, { error: next.error }, 400);

  const updated = await updateBooking(db, bookingId, {
    total_usd: next.total,
    payment_status: next.paymentStatus,
    notes: next.notes,
  });
  if (updated.error) return json(request, { error: updated.error.message }, 500);

  let payLinksExpired = 0;
  let payLinkWarning = "";
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    payLinkWarning = "The customer amount was saved, but payments are not connected, so an open pay link was not voided.";
  } else {
    try {
      const voided = await supersedeStaleBalanceLinks(new Stripe(secret), db, {
        bookingId,
        totalUsd: next.total,
        balanceUsd: next.balance,
        knownSessionId: "stripe_balance_session_id" in row ? String(row.stripe_balance_session_id || "") : "",
        customerId: "stripe_customer_id" in row ? String(row.stripe_customer_id || "") : "",
      });
      payLinksExpired = voided.expired;
      payLinkWarning = voided.warning;
    } catch (error) {
      console.error("bookings/customer-amount void pay link failed", error);
      payLinkWarning = "The customer amount was saved, but an open pay link could not be voided.";
    }
  }

  return json(request, {
    ok: true,
    total: next.total,
    subtotal: next.subtotal,
    tax: next.tax,
    balance: next.balance,
    payment_status: next.paymentStatus,
    notes: next.notes,
    taxExempt: next.taxExempt,
    payLinksExpired,
    ...(payLinkWarning ? { payLinkWarning } : {}),
  });
}
