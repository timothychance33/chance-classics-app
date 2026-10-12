"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AddressField } from "@/components/AddressField";
import { scrollToBookForm } from "@/components/BookLink";
import { DayOfContactFields } from "@/components/DayOfContactFields";
import { SecondCarField } from "@/components/SecondCarField";
import {
  BASE_HOURS,
  DAY_START_MIN,
  DEPOSIT_USD,
  earliestBookableDate,
  EXTRA_HOUR_USD,
  fromMinutes,
  LAST_START_MIN,
  MILEAGE_RULE_TEXT,
  OCCASIONS,
  openStartTimes,
  quoteTotal,
  RELIABILITY_TEXT,
  SLOT_STEP_MIN,
  toMinutes,
  WAIVER_TEXT,
} from "@/lib/booking-rules";

type MileagePreview = {
  needsReview: boolean;
  miles: number | null;
  fee: number | null;
  message: string;
};

type Props = { car: string; carName: string; basePrice: number };

export function BookingForm({ car, carName, basePrice }: Props) {
  const earliest = useMemo(() => earliestBookableDate(), []);
  useEffect(() => {
    if (window.location.hash !== "#book") return;
    scrollToBookForm();
    const timer = window.setTimeout(() => {
      const form = document.getElementById("book");
      if (window.location.hash !== "#book" || !form) return;
      const top = form.getBoundingClientRect().top;
      if (top < -8 || top > 80) scrollToBookForm();
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);
  const [date, setDate] = useState(earliest);
  const [hours, setHours] = useState(BASE_HOURS);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsReady, setSlotsReady] = useState(false);
  const [slotNote, setSlotNote] = useState("");
  const [start, setStart] = useState("");
  const [clock, setClock] = useState<ClockDraft>({ hour: "", minute: "", period: "" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState("");
  const [secondCar, setSecondCar] = useState(false);
  const [pickup, setPickup] = useState("");
  const [pickupPlaceId, setPickupPlaceId] = useState("");
  const [mileage, setMileage] = useState<MileagePreview | null>(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffPlaceId, setDropoffPlaceId] = useState("");
  const [dayOfName, setDayOfName] = useState("");
  const [dayOfPhone, setDayOfPhone] = useState("");
  const [dayOfRole, setDayOfRole] = useState("");
  const [waiver, setWaiver] = useState(false);
  const [reliability, setReliability] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const money = quoteTotal(basePrice, hours, mileage?.fee ?? 0);

  useEffect(() => {
    if (pickup.trim().length < 4) {
      setMileage(null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pickup });
      if (pickupPlaceId) params.set("pickupPlaceId", pickupPlaceId);
      fetch(`/api/mileage/?${params}`)
        .then((response) => response.json())
        .then((data) => {
          if (!ignore) setMileage(data);
        })
        .catch(() => {
          if (!ignore) setMileage({ needsReview: true, miles: null, fee: null, message: "We'll confirm mileage." });
        });
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [pickup, pickupPlaceId]);

  useEffect(() => {
    let ignore = false;
    setSlotsReady(false);
    setSlotNote("Checking open times…");
    const params = new URLSearchParams({ car, date, hours: String(hours) });
    fetch(`/api/availability/?${params}`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;
        const next = data.connected === false ? openStartTimes(hours, []) : Array.isArray(data.slots) ? data.slots : [];
        setSlots(next);
        setSlotsReady(true);
        setStart((current) => {
          const kept = current && next.includes(clockValue(current)) ? clockValue(current) : "";
          setClock(kept ? clockDraft(kept) : { hour: "", minute: "", period: "" });
          return kept;
        });
        if (data.connected === false) {
          setSlotNote(`${data.message || "Open times can’t be checked yet."} These hours are not reserved.`);
          return;
        }
        setSlotNote(data.message || data.error || (next.length ? "" : "No open times on that day for this length."));
      })
        .catch(() => {
        if (!ignore) {
          setSlots([]);
          setStart("");
          setClock({ hour: "", minute: "", period: "" });
          setSlotsReady(true);
          setSlotNote("Open times could not be loaded.");
        }
      });
    return () => {
      ignore = true;
    };
  }, [car, date, hours]);

  const startError = startTimeError(start, slots, slotsReady);
  const timeDisabled = !slotsReady || slots.length === 0;
  const periodsOpen = useMemo(() => openPeriods(slots), [slots]);
  const hourChoices = useMemo(() => hoursForPeriod(clock.period, slots), [clock.period, slots]);

  function minuteDisabled(minute: string) {
    if (!clock.hour || !clock.period) return false;
    return !slots.includes(composeStart(clock.hour, minute, clock.period));
  }

  function chooseClock(next: ClockDraft, open: string[]) {
    const adjusted = adjustClock(next, open);
    setClock(adjusted);
    setStart(adjusted.hour && adjusted.minute && adjusted.period ? composeStart(adjusted.hour, adjusted.minute, adjusted.period) : "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!slotsReady) {
      setMessage("Open times are still loading.");
      return;
    }
    const problem = start ? startTimeError(start, slots, true) : "Choose a start time.";
    if (problem) {
      setMessage(problem);
      return;
    }
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
          secondCar,
          pickup,
          pickupPlaceId,
          dropoff,
          dayOfName,
          dayOfPhone,
          dayOfRole,
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
    <form id="book" className="book-form" tabIndex={-1} onSubmit={submit}>
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
      <fieldset className="time-picker-field" aria-describedby="start-time-note">
        <legend>Start time</legend>
        <div className="time-picker">
          <label>
            <span>Hour</span>
            <select
              name="start-hour"
              required
              value={clock.hour}
              aria-invalid={Boolean(startError)}
              disabled={timeDisabled}
              onChange={(event) => chooseClock({ ...clock, hour: event.target.value }, slots)}
            >
              <option value="">Hour</option>
              {hourChoices.map((hour) => (
                <option key={hour} value={hour}>{hour}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Minutes</span>
            <select
              name="start-minute"
              required
              value={clock.minute}
              aria-invalid={Boolean(startError)}
              disabled={timeDisabled}
              onChange={(event) => chooseClock({ ...clock, minute: event.target.value }, slots)}
            >
              <option value="">Min</option>
              {MINUTE_CHOICES.map((minute) => (
                <option key={minute} value={minute} disabled={minuteDisabled(minute)}>{minute}</option>
              ))}
            </select>
          </label>
          <label>
            <span>AM/PM</span>
            <select
              name="start-period"
              required
              value={clock.period}
              aria-invalid={Boolean(startError)}
              disabled={timeDisabled}
              onChange={(event) => chooseClock({ ...clock, period: event.target.value }, slots)}
            >
              <option value="">AM/PM</option>
              {PERIOD_CHOICES.map((period) => (
                <option key={period} value={period} disabled={!periodsOpen.has(period)}>{period}</option>
              ))}
            </select>
          </label>
        </div>
        <input type="hidden" name="start" value={start} />
      </fieldset>
      <p id="start-time-note" className="note" aria-live="polite">
        {slotNote || "Start times are every 15 minutes (:00, :15, :30, :45), from 8:00 AM to 8:00 PM, and the rental has to finish the same day."}
        {startError ? ` ${startError}` : ""}
      </p>
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
      <SecondCarField checked={secondCar} onChange={setSecondCar} />
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
      <DayOfContactFields
        name={dayOfName}
        phone={dayOfPhone}
        role={dayOfRole}
        onName={setDayOfName}
        onPhone={setDayOfPhone}
        onRole={setDayOfRole}
      />
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
          {pickup.trim().length < 4
            ? "Enter the pickup address to calculate mileage."
            : mileage?.message || "Checking mileage…"}
        </p>
        <p className="price" data-price-breakdown>
          Listing {usd(money.listing)}. Mileage {mileage?.fee == null ? "to be confirmed" : usd(mileage.fee)}.
          <br />
          Subtotal {usd(money.subtotal)}{mileage?.fee == null ? " before mileage" : ""}.
          <br />
          Sales tax (10.25%) {usd(money.tax)}.
          <br />
          Total {usd(money.total)}{mileage?.fee == null ? " before mileage" : ""}.
          <br />
          Deposit due now {usd(money.deposit)}. Balance {usd(money.balance)} is billed separately.
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

function usd(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

function clockValue(value: string) {
  const minutes = toMinutes(value);
  return minutes == null ? "" : fromMinutes(minutes);
}

const MINUTE_CHOICES = ["00", "15", "30", "45"] as const;
const PERIOD_CHOICES = ["AM", "PM"] as const;
const AM_HOURS = [8, 9, 10, 11];
const PM_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8];

type ClockDraft = { hour: string; minute: string; period: string };

function clockDraft(value: string): ClockDraft {
  const minutes = toMinutes(value);
  if (minutes == null) return { hour: "", minute: "", period: "" };
  const hours24 = Math.floor(minutes / 60);
  return {
    hour: String(hours24 % 12 || 12),
    minute: String(minutes % 60).padStart(2, "0"),
    period: hours24 >= 12 ? "PM" : "AM",
  };
}

function composeStart(hour: string, minute: string, period: string) {
  const hour12 = Number(hour);
  const mins = Number(minute);
  if (!Number.isInteger(hour12) || !Number.isInteger(mins)) return "";
  let hours24 = hour12 % 12;
  if (period === "PM") hours24 += 12;
  return fromMinutes(hours24 * 60 + mins);
}

function openPeriods(slots: string[]) {
  const periods = new Set<string>();
  for (const slot of slots) {
    const draft = clockDraft(slot);
    if (draft.period) periods.add(draft.period);
  }
  return periods;
}

function hoursForPeriod(period: string, slots: string[]) {
  const open = new Set<number>();
  for (const slot of slots) {
    const draft = clockDraft(slot);
    if (!draft.hour) continue;
    if (period && draft.period !== period) continue;
    open.add(Number(draft.hour));
  }
  const order = period === "AM" ? AM_HOURS : period === "PM" ? PM_HOURS : [...AM_HOURS, ...PM_HOURS];
  return order.filter((hour, index) => open.has(hour) && order.indexOf(hour) === index);
}

function adjustClock(next: ClockDraft, slots: string[]) {
  const adjusted = { ...next };
  if (adjusted.period && !openPeriods(slots).has(adjusted.period)) adjusted.period = "";
  const hours = hoursForPeriod(adjusted.period, slots);
  if (adjusted.hour && !hours.includes(Number(adjusted.hour))) {
    adjusted.hour = "";
    adjusted.minute = "";
  }
  if (adjusted.hour && adjusted.minute && adjusted.period && !slots.includes(composeStart(adjusted.hour, adjusted.minute, adjusted.period))) {
    adjusted.minute = "";
  }
  return adjusted;
}

function startTimeError(value: string, open: string[], ready: boolean) {
  if (!ready || !value) return "";
  const minutes = toMinutes(value);
  if (
    minutes == null
    || minutes < DAY_START_MIN
    || minutes > LAST_START_MIN
    || (minutes - DAY_START_MIN) % SLOT_STEP_MIN !== 0
  ) {
    return "Choose a start time at :00, :15, :30, or :45 between 8:00 AM and 8:00 PM.";
  }
  if (!open.includes(fromMinutes(minutes))) return "That start time isn’t open for this rental length.";
  return "";
}
