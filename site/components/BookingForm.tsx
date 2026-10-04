"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AddressField } from "@/components/AddressField";
import {
  BASE_HOURS,
  DEPOSIT_USD,
  earliestBookableDate,
  EXTRA_HOUR_USD,
  MILEAGE_RULE_TEXT,
  OCCASIONS,
  openStartTimes,
  quoteTotal,
  RELIABILITY_TEXT,
  WAIVER_TEXT,
} from "@/lib/booking-rules";

type MileagePreview = {
  needsReview: boolean;
  toPickup: number | null;
  between: number | null;
  miles: number | null;
  fee: number | null;
  message: string;
};

type Props = { car: string; carName: string; basePrice: number };

export function BookingForm({ car, carName, basePrice }: Props) {
  const earliest = useMemo(() => earliestBookableDate(), []);
  const [date, setDate] = useState(earliest);
  const [hours, setHours] = useState(BASE_HOURS);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotNote, setSlotNote] = useState("");
  const [start, setStart] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState("");
  const [pickup, setPickup] = useState("");
  const [pickupPlaceId, setPickupPlaceId] = useState("");
  const [mileage, setMileage] = useState<MileagePreview | null>(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffPlaceId, setDropoffPlaceId] = useState("");
  const [waiver, setWaiver] = useState(false);
  const [reliability, setReliability] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const money = quoteTotal(basePrice, hours, mileage?.fee ?? 0);

  useEffect(() => {
    if (pickup.trim().length < 4 || dropoff.trim().length < 4) {
      setMileage(null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pickup, dropoff });
      if (pickupPlaceId) params.set("pickupPlaceId", pickupPlaceId);
      if (dropoffPlaceId) params.set("dropoffPlaceId", dropoffPlaceId);
      fetch(`/api/mileage/?${params}`)
        .then((response) => response.json())
        .then((data) => {
          if (!ignore) setMileage(data);
        })
        .catch(() => {
          if (!ignore) setMileage({ needsReview: true, toPickup: null, between: null, miles: null, fee: null, message: "We'll confirm mileage." });
        });
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [pickup, pickupPlaceId, dropoff, dropoffPlaceId]);

  useEffect(() => {
    let ignore = false;
    setStart("");
    setSlotNote("Checking open times…");
    const params = new URLSearchParams({ car, date, hours: String(hours) });
    fetch(`/api/availability/?${params}`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;
        if (data.connected === false) {
          setSlots(openStartTimes(hours, []));
          setSlotNote(`${data.message || "Open times can’t be checked yet."} These hours are not reserved.`);
          return;
        }
        setSlots(Array.isArray(data.slots) ? data.slots : []);
        setSlotNote(data.message || data.error || "");
      })
      .catch(() => {
        if (!ignore) setSlotNote("Open times could not be loaded.");
      });
    return () => {
      ignore = true;
    };
  }, [car, date, hours]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/bookings/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          car,
          date,
          start,
          hours,
          name,
          email,
          phone,
          occasion,
          pickup,
          pickupPlaceId,
          dropoff,
          dropoffPlaceId,
          waiver,
          reliability,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setMessage(data.error || "The booking could not be started.");
    } catch {
      setMessage("The booking could not be started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="book" className="book-form" onSubmit={submit}>
      <h2>Book {carName}</h2>
      <p>
        ${basePrice} covers the first 2 hours. Each extra hour is ${EXTRA_HOUR_USD}. A ${DEPOSIT_USD} non-refundable deposit holds the time. Book at least 7 days ahead. You can cancel up to 72 hours before the event; inside 72 hours the deposit and fees already paid are forfeited.
      </p>
      <div className="book-grid">
        <label>
          Date
          <input type="date" name="date" required min={earliest} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Duration
          <select name="hours" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
            {[2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} hours{value === 2 ? " (base)" : ` (+$${EXTRA_HOUR_USD * (value - 2)})`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Open start times</legend>
        {slotNote && <p className="note">{slotNote}</p>}
        {slots.length > 0 ? (
          <div className="slots" role="radiogroup" aria-label="Open start times">
            {slots.map((slot) => (
              <label key={slot} className={start === slot ? "slot on" : "slot"}>
                <input type="radio" name="start" value={slot} checked={start === slot} onChange={() => setStart(slot)} required />
                {formatSlot(slot)}
              </label>
            ))}
          </div>
        ) : (
          !slotNote && <p className="note">No open times on that day for this length.</p>
        )}
      </fieldset>
      <div className="book-grid">
        <label>
          Your name
          <input name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Phone
          <input type="tel" name="phone" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          Occasion
          <select name="occasion" required value={occasion} onChange={(event) => setOccasion(event.target.value)}>
            <option value="">Choose</option>
            {OCCASIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Pickup address
        <AddressField
          name="pickup"
          required
          value={pickup}
          placeId={pickupPlaceId}
          placeholder="Event or pickup address"
          onValue={(next, id) => {
            setPickup(next);
            setPickupPlaceId(id);
          }}
        />
      </label>
      <label>
        Drop-off address
        <AddressField
          name="dropoff"
          required
          value={dropoff}
          placeId={dropoffPlaceId}
          placeholder="Drop-off address"
          onValue={(next, id) => {
            setDropoff(next);
            setDropoffPlaceId(id);
          }}
        />
      </label>
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
      <div className="mileage-line" data-mileage>
        <p>{MILEAGE_RULE_TEXT}</p>
        <p>
          {pickup.trim().length < 4 || dropoff.trim().length < 4
            ? "Enter the pickup and drop-off addresses to calculate mileage."
            : mileage?.message || "Checking mileage…"}
        </p>
        <p className="price">
          Listing ${money.listing}. Mileage {mileage?.fee == null ? "to be confirmed" : `$${mileage.fee}`}. Deposit due now ${money.deposit}. Balance ${money.balance} is billed separately.
        </p>
      </div>
      {message && <p className="form-error" role="alert">{message}</p>}
      <p className="book-actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Please wait…" : `Book with $${DEPOSIT_USD} deposit`}</button>
        <Link href="/quoterequest/">Prefer to talk? Request a quote</Link>
      </p>
    </form>
  );
}

function formatSlot(slot: string) {
  const [hourText, minute] = slot.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}
