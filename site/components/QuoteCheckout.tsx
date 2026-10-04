"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEPOSIT_USD, QUOTE_LINK_EXPIRED, RELIABILITY_TEXT, WAIVER_TEXT } from "@/lib/booking-rules";

type Line = { label: string; amount: number };
type QuoteView = {
  carName: string;
  date: string | null;
  time: string;
  hours: number | null;
  pickup: string;
  dropoff: string;
  name: string;
  email: string;
  phone: string;
  occasion: string;
  note: string;
  lines: Line[];
  total: number;
  deposit: number;
  balance: number;
};

function money(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function QuoteCheckout({ token }: { token: string }) {
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [closed, setClosed] = useState("");
  const [availability, setAvailability] = useState("");
  const [waiver, setWaiver] = useState(false);
  const [reliability, setReliability] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function pay() {
    setMessage("");
    if (!waiver || !reliability) {
      setMessage("Accept both notices to continue.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/quotes/book/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, waiver, reliability }),
      });
      const data = await response.json();
      if (data.url) {
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
          <p key={`${line.label}-${line.amount}`}><span>{line.label}</span> <b>{money(line.amount)}</b></p>
        ))}
        <p className="price">
          Total {money(quote.total)}. Deposit due now {money(quote.deposit)}. Balance {money(quote.balance)} is billed separately.
        </p>
      </div>
      {quote.note && <p>{quote.note}</p>}
      {availability && <p className="form-error" role="alert">{availability}</p>}
      <form className="book-form" onSubmit={(event) => { event.preventDefault(); pay(); }}>
        <label className="check">
          <input type="checkbox" checked={waiver} onChange={(event) => setWaiver(event.target.checked)} required />
          <span>
            {WAIVER_TEXT}{" "}
            <Link href="/rental-terms/">Read the rental terms</Link>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={reliability} onChange={(event) => setReliability(event.target.checked)} required />
          <span>{RELIABILITY_TEXT}</span>
        </label>
        {message && <p className="form-error" role="alert">{message}</p>}
        <button className="btn" type="submit" disabled={busy || Boolean(availability)}>
          {busy ? "Please wait…" : `Book with $${quote.deposit || DEPOSIT_USD} deposit`}
        </button>
      </form>
    </article>
  );
}
