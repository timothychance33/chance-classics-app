"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DayOfContactFields } from "@/components/DayOfContactFields";
import { CARD_SAVE_TEXT, DEPOSIT_USD, QUOTE_LINK_EXPIRED, RELIABILITY_TEXT, WAIVER_TEXT, validateDayOfContact } from "@/lib/booking-rules";

type Line = { label: string; amount: number };
type QuoteView = {
  carName: string;
  date: string | null;
  time: string;
  end?: string;
  hours: number | null;
  pickup: string;
  dropoff: string;
  name: string;
  email: string;
  phone: string;
  occasion: string;
  note: string;
  taxExemptNote?: string;
  lines: Line[];
  total: number;
  deposit: number;
  balance: number;
};

function money(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function dayOfFieldError(field: "name" | "phone" | "role", value: string) {
  const filled = { name: "Day Contact", phone: "3183445001", role: "Planner", [field]: value };
  const result = validateDayOfContact(filled);
  return result.ok ? "" : result.error;
}

export function QuoteCheckout({ token }: { token: string }) {
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [closed, setClosed] = useState("");
  const [availability, setAvailability] = useState("");
  const [waiver, setWaiver] = useState(false);
  const [reliability, setReliability] = useState(false);
  const [dayOfName, setDayOfName] = useState("");
  const [dayOfPhone, setDayOfPhone] = useState("");
  const [dayOfRole, setDayOfRole] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let ignore = false;
    fetch(`/api/quotes/book/?token=${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;
        if (!data.ok) {
          setClosed(data.message || QUOTE_LINK_EXPIRED);
          return;
        }
        setQuote(data.quote);
        setAvailability(data.available ? "" : data.availability || "That time is no longer open.");
      })
      .catch(() => {
        if (!ignore) setClosed("This quote could not be loaded.");
      });
    return () => {
      ignore = true;
    };
  }, [token]);

  const dayOf = validateDayOfContact({ name: dayOfName, phone: dayOfPhone, role: dayOfRole });
  function show(field: "name" | "phone" | "role" | "waiver" | "reliability") {
    return tried || touched[field];
  }
  const dayOfErrors = {
    name: show("name") ? dayOfFieldError("name", dayOfName) : "",
    phone: show("phone") ? dayOfFieldError("phone", dayOfPhone) : "",
    role: show("role") ? dayOfFieldError("role", dayOfRole) : "",
  };
  const waiverError = show("waiver") && !waiver ? "Accept the rental terms to continue." : "";
  const reliabilityError = show("reliability") && !reliability ? "Accept the classic-car reliability notice to continue." : "";

  async function pay() {
    setMessage("");
    setTried(true);
    if (!dayOf.ok || !waiver || !reliability) return;
    setBusy(true);
    try {
      const response = await fetch("/api/quotes/book/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, waiver, reliability, dayOfName, dayOfPhone, dayOfRole }),
      });
      const data = await response.json();
      if (data.url) {
        try {
          const hotel = quote?.lines.find((line) => line.label.startsWith("Overnight driver hotel") && line.amount > 0);
          if (hotel) {
            sessionStorage.setItem(
              "chance-classics-hotel-line",
              `${hotel.label}: $${hotel.amount.toFixed(2)}. It is included in the total.`,
            );
          } else sessionStorage.removeItem("chance-classics-hotel-line");
        } catch {
          /* The checkout page still names the charge. */
        }
        window.location.assign(data.url);
        return;
      }
      setMessage(data.error || QUOTE_LINK_EXPIRED);
    } catch {
      setMessage("The booking could not be started.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <article className="wrap page">
        <h1>Quote checkout</h1>
        <p className="form-error" role="status">{closed}</p>
        <p><Link href="/quoterequest/">Request a new quote</Link></p>
      </article>
    );
  }
  if (!quote) {
    return (
      <article className="wrap page">
        <h1>Quote checkout</h1>
        <p>Loading the quote…</p>
      </article>
    );
  }

  return (
    <article className="wrap page">
      <h1>Book {quote.carName}</h1>
      <p>This checkout is locked to the quote Chance Classics sent. The car, date, and price stay as quoted.</p>
      <dl className="quote-lock">
        <div><dt>Car</dt><dd>{quote.carName}</dd></div>
        <div><dt>Date</dt><dd>{quote.date} {quote.time}</dd></div>
        {quote.end ? <div><dt>Ends</dt><dd>{quote.end}</dd></div> : null}
        <div><dt>Hours</dt><dd>{quote.hours}</dd></div>
        {quote.occasion && <div><dt>Occasion</dt><dd>{quote.occasion}</dd></div>}
        <div><dt>Pickup</dt><dd>{quote.pickup}</dd></div>
        {quote.dropoff && <div><dt>Drop-off</dt><dd>{quote.dropoff}</dd></div>}
        <div><dt>Name</dt><dd>{quote.name}</dd></div>
        <div><dt>Email</dt><dd>{quote.email}</dd></div>
        {quote.phone && <div><dt>Phone</dt><dd>{quote.phone}</dd></div>}
      </dl>
      <div className="mileage-line" data-quote-lines>
        {quote.lines.map((line) => (
          line.label === "Tax exempt"
            ? <p key="tax-exempt"><span>Tax exempt</span>{quote.taxExemptNote ? <> · {quote.taxExemptNote}</> : null}</p>
            : <p key={`${line.label}-${line.amount}`}><span>{line.label}</span> <b>{money(line.amount)}</b></p>
        ))}
        <p className="price">
          Total {money(quote.total)}. Deposit due now {money(quote.deposit)}. Balance {money(quote.balance)} is billed separately.
        </p>
        <p>{CARD_SAVE_TEXT}</p>
      </div>
      {quote.note && <p>{quote.note}</p>}
      {availability && <p className="form-error" role="alert">{availability}</p>}
      <form className="book-form" noValidate onSubmit={(event) => { event.preventDefault(); pay(); }}>
        <DayOfContactFields
          name={dayOfName}
          phone={dayOfPhone}
          role={dayOfRole}
          errors={dayOfErrors}
          onBlur={(field) => setTouched((current) => ({ ...current, [field]: true }))}
          onName={setDayOfName}
          onPhone={setDayOfPhone}
          onRole={setDayOfRole}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={waiver}
            aria-invalid={waiverError ? true : undefined}
            aria-describedby="quote-waiver-error"
            onBlur={() => setTouched((current) => ({ ...current, waiver: true }))}
            onChange={(event) => setWaiver(event.target.checked)}
          />
          <span>
            {WAIVER_TEXT}{" "}
            <Link href="/rental-terms/">Read the rental terms</Link>
          </span>
        </label>
        <span id="quote-waiver-error" className="field-error" role={waiverError ? "alert" : undefined}>{waiverError}</span>
        <label className="check">
          <input
            type="checkbox"
            checked={reliability}
            aria-invalid={reliabilityError ? true : undefined}
            aria-describedby="quote-reliability-error"
            onBlur={() => setTouched((current) => ({ ...current, reliability: true }))}
            onChange={(event) => setReliability(event.target.checked)}
          />
          <span>{RELIABILITY_TEXT}</span>
        </label>
        <span id="quote-reliability-error" className="field-error" role={reliabilityError ? "alert" : undefined}>{reliabilityError}</span>
        <p className="book-alert form-error" role={message ? "alert" : undefined}>{message}</p>
        <button className="btn book-pay" type="submit" disabled={busy || Boolean(availability)}>
          {busy ? "Please wait…" : `Book with $${quote.deposit || DEPOSIT_USD} deposit`}
        </button>
      </form>
    </article>
  );
}
