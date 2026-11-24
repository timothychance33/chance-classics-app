"use client";

import { useMemo, useState } from "react";
import {
  ALREADY_BOOKED_LABEL,
  addDays,
  formatCalendarDate,
} from "@/lib/booking-rules";

type Props = {
  date: string;
  bookedDates: readonly string[];
  minDate: string;
  maxDate: string;
  ready: boolean;
  hasCar: boolean;
  carLabel: string;
  onChange: (date: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStart(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function shiftMonth(iso: string, delta: number) {
  const [year, month] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return next.toISOString().slice(0, 10);
}

function monthTitle(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function daysInMonth(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function QuoteDatePicker({
  date,
  bookedDates,
  minDate,
  maxDate,
  ready,
  hasCar,
  carLabel,
  onChange,
}: Props) {
  const booked = useMemo(() => new Set(bookedDates), [bookedDates]);
  const [view, setView] = useState(() => monthStart(date || minDate));
  const first = monthStart(view);
  const blanks = weekdayOf(first);
  const count = daysInMonth(first);
  const cells: (string | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: count }, (_, index) => addDays(first, index)),
  ];
  const bookedSelected = Boolean(date && booked.has(date));
  const minMonth = monthStart(minDate);
  const maxMonth = monthStart(maxDate);
  const carName = carLabel.split(" - ")[0].trim();

  return (
    <div className="quote-cal">
      <div className="quote-cal-head">
        <button
          type="button"
          className="quote-cal-nav"
          disabled={first <= minMonth}
          aria-label="Previous month"
          onClick={() => setView(shiftMonth(first, -1))}
        >
          ‹
        </button>
        <p className="quote-cal-month">{monthTitle(first)}</p>
        <button
          type="button"
          className="quote-cal-nav"
          disabled={first >= maxMonth}
          aria-label="Next month"
          onClick={() => setView(shiftMonth(first, 1))}
        >
          ›
        </button>
      </div>
      <div className="quote-cal-week" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="quote-cal-grid" role="grid" aria-label="Event date">
        {cells.map((iso, index) => {
          if (!iso) return <div key={`empty-${index}`} className="quote-cal-empty" />;
          const day = Number(iso.slice(8, 10));
          const isBooked = booked.has(iso);
          const isPast = iso < minDate || iso > maxDate;
          const selected = date === iso;
          const label = isBooked
            ? `${formatCalendarDate(iso)} ${ALREADY_BOOKED_LABEL}`
            : formatCalendarDate(iso);
          if (isPast || isBooked) {
            return (
              <div
                key={iso}
                className={`quote-cal-day is-disabled${isBooked ? " is-booked" : ""}${selected ? " is-selected" : ""}`}
                aria-disabled="true"
                aria-label={label}
                title={isBooked ? `${formatCalendarDate(iso)} ${ALREADY_BOOKED_LABEL}` : label}
              >
                <span className="quote-cal-num">{day}</span>
                {isBooked && <span className="quote-cal-label">{ALREADY_BOOKED_LABEL}</span>}
              </div>
            );
          }
          return (
            <button
              key={iso}
              type="button"
              className={`quote-cal-day${selected ? " is-selected" : ""}`}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onChange(iso)}
            >
              <span className="quote-cal-num">{day}</span>
            </button>
          );
        })}
      </div>
      <p className={`quote-cal-note${bookedSelected ? " is-booked" : ""}`} aria-live="polite">
        {!hasCar
          ? "Choose a car first to see which dates are already booked."
          : !ready
            ? "Checking booked dates…"
            : bookedSelected
              ? `${formatCalendarDate(date)} ${ALREADY_BOOKED_LABEL}${carName ? ` — ${carName} is unavailable that day.` : ""}`
              : date
                ? formatCalendarDate(date)
                : "Select an available date. Gray dates marked (Already booked) cannot be requested."}
      </p>
    </div>
  );
}
