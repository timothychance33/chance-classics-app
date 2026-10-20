"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AddressField } from "@/components/AddressField";
import { scrollToBookForm } from "@/components/BookLink";
import { DayOfContactFields } from "@/components/DayOfContactFields";
import { SecondCarField } from "@/components/SecondCarField";
import { secondCarAddon } from "@/data/packages";
import { BOOKING_DRAFT_PREFIX } from "@/lib/booking-draft";
import {
  BASE_HOURS,
  CARD_SAVE_TEXT,
  DEPOSIT_USD,
  EXTRA_HOUR_USD,
  MILEAGE_RULE_TEXT,
  OCCASIONS,
  RELIABILITY_TEXT,
  WAIVER_TEXT,
  earliestBookableDate,
  fromMinutes,
  openStartTimes,
  quoteTotal,
  toMinutes,
  validateBooking,
  validateDayOfContact,
  weddingCelebrationErrors,
  type BookingInput,
  type WeddingCelebrationInput,
} from "@/lib/booking-rules";

type MileagePreview = {
  needsReview: boolean;
  miles: number | null;
  fee: number | null;
  message: string;
};

type Props = { car: string; carName: string; basePrice: number };

const STEPS = ["when", "contact", "where", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL: Record<Step, string> = {
  when: "When",
  contact: "Contact",
  where: "Where",
  review: "Review",
};

const STEP_FIELDS: Record<Step, string[]> = {
  when: ["date", "hours", "start"],
  contact: ["name", "email", "phone", "occasion", "partner1Name", "partner1Social", "partner2Name", "partner2Social", "photographerName", "photographerEmail", "photographerInstagram"],
  where: ["pickup", "dropoff", "dayOfName", "dayOfPhone", "dayOfRole"],
  review: ["waiver", "reliability"],
};

const FIELD_ID: Record<string, string> = {
  date: "book-date",
  hours: "book-hours",
  start: "book-start",
  name: "book-name",
  email: "book-email",
  phone: "book-phone",
  occasion: "book-occasion",
  partner1Name: "wedding-partner-1-name",
  partner1Social: "wedding-partner-1-social",
  partner2Name: "wedding-partner-2-name",
  partner2Social: "wedding-partner-2-social",
  photographerName: "wedding-photographer-name",
  photographerEmail: "wedding-photographer-email",
  photographerInstagram: "wedding-photographer-instagram",
  pickup: "book-pickup",
  dropoff: "book-dropoff",
  dayOfName: "day-of-name",
  dayOfPhone: "day-of-phone",
  dayOfRole: "day-of-role",
  waiver: "book-waiver",
  reliability: "book-reliability",
};

const HOUR_CHOICES = [2, 3, 4, 5, 6];

type Draft = {
  date: string;
  hours: number;
  start: string;
  name: string;
  email: string;
  phone: string;
  occasion: string;
  partner1Name: string;
  partner1Social: string;
  partner2Name: string;
  partner2Social: string;
  photographerName: string;
  photographerEmail: string;
  photographerInstagram: string;
  secondCar: boolean;
  pickup: string;
  pickupPlaceId: string;
  dropoff: string;
  dropoffPlaceId: string;
  sameDropoff: boolean;
  callMe: boolean;
  dayOfName: string;
  dayOfPhone: string;
  dayOfRole: string;
  waiver: boolean;
  reliability: boolean;
};

export function BookingForm({ car, carName, basePrice }: Props) {
  const earliest = useMemo(() => earliestBookableDate(), []);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(earliest));
  const [step, setStep] = useState<Step>("when");
  const [furthest, setFurthest] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsReady, setSlotsReady] = useState(false);
  const [slotNote, setSlotNote] = useState("");
  const [mileage, setMileage] = useState<MileagePreview | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const stack = useRef<Step[]>(["when"]);
  const pendingFocus = useRef<string | null>(null);
  const skipStepFocus = useRef(true);

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

  useEffect(() => {
    const saved = readDraft(car, earliest);
    let initial: Step = "when";
    if (saved) {
      setDraft(saved.draft);
      setStep(saved.step);
      setFurthest(saved.furthest);
      stack.current = [saved.step];
      initial = saved.step;
      if (weddingFilled(saved.draft)) setCelebrateOpen(true);
    }
    const cancelled = new URLSearchParams(window.location.search).get("booking") === "cancelled";
    if (cancelled) {
      initial = "review";
      setStep("review");
      setFurthest(STEPS.length - 1);
      setNotice("Payment was not completed. Nothing was charged.");
      stack.current = ["review"];
    }
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ ...historyState(), bookStep: initial }, "", url);
    setHydrated(true);
    if (cancelled) {
      window.setTimeout(() => document.getElementById("book-notice")?.focus(), 0);
    }

    const onPop = (event: PopStateEvent) => {
      const raw = event.state && typeof event.state === "object" ? (event.state as { bookStep?: unknown }).bookStep : undefined;
      const next = isStep(raw) ? raw : "when";
      const found = stack.current.lastIndexOf(next);
      if (found >= 0 && found < stack.current.length - 1) {
        stack.current = stack.current.slice(0, found + 1);
      } else if (stack.current[stack.current.length - 1] !== next) {
        stack.current = [...stack.current, next];
      }
      setStep(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [car, earliest]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        `${BOOKING_DRAFT_PREFIX}${car}`,
        JSON.stringify({ step, furthest, draft }),
      );
    } catch {
      /* The form still keeps what they typed for this visit. */
    }
  }, [car, draft, furthest, hydrated, step]);

  useEffect(() => {
    if (!hydrated) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target) {
      window.requestAnimationFrame(() => document.getElementById(target)?.focus());
      return;
    }
    if (skipStepFocus.current) {
      skipStepFocus.current = false;
      return;
    }
    const form = document.getElementById("book");
    if (form) {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      form.scrollIntoView({ block: "start", inline: "nearest" });
      root.style.scrollBehavior = previous;
    }
    document.getElementById("book-step-title")?.focus({ preventScroll: true });
  }, [hydrated, step]);

  useEffect(() => {
    if (draft.pickup.trim().length < 4) {
      setMileage(null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pickup: draft.pickup });
      if (draft.pickupPlaceId) params.set("pickupPlaceId", draft.pickupPlaceId);
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
  }, [draft.pickup, draft.pickupPlaceId]);

  useEffect(() => {
    let ignore = false;
    setSlotsReady(false);
    setSlotNote("Checking open times…");
    const params = new URLSearchParams({ car, date: draft.date, hours: String(draft.hours) });
    fetch(`/api/availability/?${params}`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;
        const next = data.connected === false ? openStartTimes(draft.hours, []) : Array.isArray(data.slots) ? data.slots : [];
        setSlots(next);
        setSlotsReady(true);
        setDraft((current) => {
          if (!current.start) return current;
          const kept = clockValue(current.start);
          if (kept && next.includes(kept)) return kept === current.start ? current : { ...current, start: kept };
          return { ...current, start: "" };
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
          setDraft((current) => (current.start ? { ...current, start: "" } : current));
          setSlotsReady(true);
          setSlotNote("Open times could not be loaded.");
        }
      });
    return () => {
      ignore = true;
    };
  }, [car, draft.date, draft.hours]);

  const input = useMemo(() => bookingInput(draft, car), [draft, car]);
  const wedding = useMemo(() => weddingInput(draft), [draft]);
  const errors = useMemo(() => collectErrors(input, slots, slotsReady, wedding), [input, slots, slotsReady, wedding]);
  const money = quoteTotal(basePrice, draft.hours, mileage?.fee ?? 0);
  const returnToReview = furthest >= STEPS.length - 1 && step !== "review";

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function touch(field: string) {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }

  function reveal(which: Step) {
    setTouched((current) => {
      const next = { ...current };
      for (const field of STEP_FIELDS[which]) next[field] = true;
      return next;
    });
  }

  function shown(field: string) {
    return touched[field] ? errors[field] || "" : "";
  }

  function pushStep(next: Step) {
    if (next === step) return;
    stack.current = [...stack.current, next];
    setStep(next);
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState({ ...historyState(), bookStep: next }, "", url);
  }

  function focusProblem(problem: { step: Step; field: string }) {
    reveal(problem.step);
    const id = FIELD_ID[problem.field];
    const weddingField = problem.field in wedding;
    if (weddingField) setCelebrateOpen(true);
    if (problem.step === step) {
      if (id) {
        if (weddingField) window.setTimeout(() => document.getElementById(id)?.focus(), 0);
        else document.getElementById(id)?.focus();
      }
      return;
    }
    pendingFocus.current = id || null;
    pushStep(problem.step);
  }

  function back() {
    const prev = STEPS[STEPS.indexOf(step) - 1];
    if (!prev) return;
    setMessage("");
    if (stack.current.length > 1) {
      window.history.back();
      return;
    }
    stack.current = [prev];
    setStep(prev);
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ ...historyState(), bookStep: prev }, "", url);
  }

  function advance() {
    setMessage("");
    if (step === "when" && !slotsReady) {
      setMessage("Open times are still loading.");
      reveal("when");
      return;
    }
    const problem = firstProblem(errors);
    const currentIndex = STEPS.indexOf(step);
    if (errors.form) {
      setMessage(errors.form);
      return;
    }
    if (problem && STEPS.indexOf(problem.step) <= currentIndex) {
      focusProblem(problem);
      return;
    }
    if (step === "review") {
      if (problem) {
        focusProblem(problem);
        return;
      }
      void pay();
      return;
    }
    if (furthest >= STEPS.length - 1) {
      if (problem) {
        focusProblem(problem);
        return;
      }
      pushStep("review");
      return;
    }
    const next = STEPS[currentIndex + 1];
    setFurthest((value) => Math.max(value, STEPS.indexOf(next)));
    pushStep(next);
  }

  async function pay() {
    setBusy(true);
    try {
      const response = await fetch("/api/bookings/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          car,
          date: draft.date,
          start: draft.start,
          hours: draft.hours,
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          occasion: draft.occasion,
          secondCar: draft.secondCar,
          pickup: draft.pickup,
          pickupPlaceId: draft.pickupPlaceId,
          dropoff: input.dropoff,
          dayOfName: input.dayOfName,
          dayOfPhone: input.dayOfPhone,
          dayOfRole: input.dayOfRole,
          partner1Name: draft.partner1Name,
          partner1Social: draft.partner1Social,
          partner2Name: draft.partner2Name,
          partner2Social: draft.partner2Social,
          photographerName: draft.photographerName,
          photographerEmail: draft.photographerEmail,
          photographerInstagram: draft.photographerInstagram,
          waiver: draft.waiver,
          reliability: draft.reliability,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      const error = data.error || "The booking could not be started.";
      setMessage(error);
      const field = fieldForError(error);
      if (field) focusProblem({ step: stepForField(field), field });
    } catch {
      setMessage("The booking could not be started.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    advance();
  }

  if (!hydrated) {
    return (
      <form id="book" className="book-form" tabIndex={-1} aria-busy="true">
        <h2>Book {carName}</h2>
        <p>Loading your booking…</p>
      </form>
    );
  }

  const stepTitle = step === "when"
    ? `When do you need ${carName}?`
    : step === "contact"
      ? "How can we reach you?"
      : step === "where"
        ? "Where should we pick up?"
        : "Review and pay the deposit";

  return (
    <form id="book" className="book-form" tabIndex={-1} noValidate onSubmit={submit}>
      <h2>Book {carName}</h2>
      <p className="sr-only" aria-live="polite">{`Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}, ${STEP_LABEL[step]}`}</p>
      <ol className="book-steps" aria-label="Booking steps">
        {STEPS.map((item, index) => (
          <li key={item}>
            <button
              type="button"
              aria-current={item === step ? "step" : undefined}
              disabled={STEPS.indexOf(item) > STEPS.indexOf(step)}
              onClick={() => {
                if (STEPS.indexOf(item) < STEPS.indexOf(step)) pushStep(item);
              }}
            >
              <span className="book-step-num">{index + 1}</span>
              {STEP_LABEL[item]}
            </button>
          </li>
        ))}
      </ol>
      {notice && (
        <p id="book-notice" className="book-notice" role="status" tabIndex={-1}>{notice}</p>
      )}
      <h3 id="book-step-title" className="book-step-title" tabIndex={-1}>{stepTitle}</h3>

      {step === "when" && (
        <>
          <p>
            ${basePrice} covers the first 2 hours. Each extra hour is ${EXTRA_HOUR_USD}. A ${DEPOSIT_USD} non-refundable deposit holds the time. Book at least 7 days ahead. You can cancel up to 72 hours before the event; inside 72 hours the deposit and fees already paid are forfeited.
          </p>
          <label htmlFor="book-date">
            Date
            <input
              id="book-date"
              type="date"
              name="date"
              autoComplete="off"
              required
              min={earliest}
              value={draft.date}
              aria-invalid={shown("date") ? true : undefined}
              aria-describedby="book-date-error"
              onBlur={() => touch("date")}
              onChange={(event) => patch({ date: event.target.value })}
            />
            <FieldError id="book-date-error" message={shown("date")} />
          </label>
          <fieldset className="choice-list hour-choices" id="book-hours">
            <legend>Hours</legend>
            {HOUR_CHOICES.map((value) => (
              <label key={value} className="choice">
                <input
                  type="radio"
                  name="hours"
                  value={value}
                  checked={draft.hours === value}
                  onChange={() => patch({ hours: value })}
                />
                <span className="hour-num">{value}</span>
                <span className="hour-note">{value === BASE_HOURS ? "base" : `+$${EXTRA_HOUR_USD * (value - BASE_HOURS)}`}</span>
              </label>
            ))}
          </fieldset>
          <FieldError id="book-hours-error" message={shown("hours")} />
          <label htmlFor="book-start">
            Start time
            <select
              id="book-start"
              name="start"
              value={draft.start}
              disabled={!slotsReady || slots.length === 0}
              aria-invalid={shown("start") ? true : undefined}
              aria-describedby="book-start-error start-time-note"
              onBlur={() => touch("start")}
              onChange={(event) => patch({ start: event.target.value })}
            >
              <option value="">{slotsReady ? (slots.length ? "Choose a time" : "No open times") : "Loading times…"}</option>
              {slots.map((slot) => (
                <option key={slot} value={slot}>{clockLabel(slot)}</option>
              ))}
            </select>
            <FieldError id="book-start-error" message={shown("start")} />
          </label>
          <p id="start-time-note" className="note" aria-live="polite">
            {slotNote || "Start times are every 15 minutes, from 8:00 AM to 8:00 PM, and the rental has to finish the same day."}
          </p>
        </>
      )}

      {step === "contact" && (
        <>
          <label htmlFor="book-name">
            Your name
            <input
              id="book-name"
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              aria-required="true"
              value={draft.name}
              aria-invalid={shown("name") ? true : undefined}
              aria-describedby="book-name-error"
              onBlur={() => touch("name")}
              onChange={(event) => patch({ name: event.target.value })}
            />
            <FieldError id="book-name-error" message={shown("name")} />
          </label>
          <label htmlFor="book-email">
            Email
            <input
              id="book-email"
              type="email"
              inputMode="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              aria-required="true"
              value={draft.email}
              aria-invalid={shown("email") ? true : undefined}
              aria-describedby="book-email-error"
              onBlur={() => touch("email")}
              onChange={(event) => patch({ email: event.target.value })}
            />
            <FieldError id="book-email-error" message={shown("email")} />
          </label>
          <label htmlFor="book-phone">
            Phone
            <input
              id="book-phone"
              type="tel"
              inputMode="tel"
              name="phone"
              autoComplete="tel"
              enterKeyHint="next"
              aria-required="true"
              value={draft.phone}
              aria-invalid={shown("phone") ? true : undefined}
              aria-describedby="book-phone-error"
              onBlur={() => touch("phone")}
              onChange={(event) => patch({ phone: event.target.value })}
            />
            <FieldError id="book-phone-error" message={shown("phone")} />
          </label>
          <fieldset className="choice-list" id="book-occasion">
            <legend>Occasion</legend>
            {OCCASIONS.map((item) => (
              <label key={item} className="choice">
                <input
                  type="radio"
                  name="occasion"
                  value={item}
                  checked={draft.occasion === item}
                  onChange={() => patch({ occasion: item })}
                />
                <span>{item}</span>
              </label>
            ))}
          </fieldset>
          <FieldError id="book-occasion-error" message={shown("occasion")} />
          {draft.occasion === "Wedding" && (
            <details
              className="celebrate"
              open={celebrateOpen || WEDDING_KEYS.some((field) => shown(field))}
              onToggle={(event) => setCelebrateOpen(event.currentTarget.open)}
            >
              <summary>Help us celebrate (optional)</summary>
              <p className="note">These details are optional. Skipping them does not change the price.</p>
              <WeddingField
                id="wedding-partner-1-name"
                label="Bride / partner 1 name"
                name="partner1Name"
                autoComplete="section-wedding name"
                value={draft.partner1Name}
                error={shown("partner1Name")}
                onBlur={() => touch("partner1Name")}
                onChange={(value) => patch({ partner1Name: value })}
              />
              <WeddingField
                id="wedding-partner-1-social"
                label="Social handle"
                name="partner1Social"
                autoComplete="off"
                value={draft.partner1Social}
                error={shown("partner1Social")}
                onBlur={() => touch("partner1Social")}
                onChange={(value) => patch({ partner1Social: value })}
              />
              <WeddingField
                id="wedding-partner-2-name"
                label="Groom / partner 2 name"
                name="partner2Name"
                autoComplete="section-wedding name"
                value={draft.partner2Name}
                error={shown("partner2Name")}
                onBlur={() => touch("partner2Name")}
                onChange={(value) => patch({ partner2Name: value })}
              />
              <WeddingField
                id="wedding-partner-2-social"
                label="Social handle"
                name="partner2Social"
                autoComplete="off"
                value={draft.partner2Social}
                error={shown("partner2Social")}
                onBlur={() => touch("partner2Social")}
                onChange={(value) => patch({ partner2Social: value })}
              />
              <WeddingField
                id="wedding-photographer-name"
                label="Photographer name"
                name="photographerName"
                autoComplete="section-photographer name"
                value={draft.photographerName}
                error={shown("photographerName")}
                onBlur={() => touch("photographerName")}
                onChange={(value) => patch({ photographerName: value })}
              />
              <WeddingField
                id="wedding-photographer-email"
                label="Photographer email"
                name="photographerEmail"
                type="email"
                inputMode="email"
                autoComplete="section-photographer email"
                value={draft.photographerEmail}
                error={shown("photographerEmail")}
                onBlur={() => touch("photographerEmail")}
                onChange={(value) => patch({ photographerEmail: value })}
              />
              <WeddingField
                id="wedding-photographer-instagram"
                label="Photographer Instagram"
                name="photographerInstagram"
                autoComplete="off"
                value={draft.photographerInstagram}
                error={shown("photographerInstagram")}
                onBlur={() => touch("photographerInstagram")}
                onChange={(value) => patch({ photographerInstagram: value })}
              />
            </details>
          )}
        </>
      )}

      {step === "where" && (
        <>
          <label htmlFor="book-pickup">
            Pickup address
            <AddressField
              id="book-pickup"
              name="pickup"
              value={draft.pickup}
              placeId={draft.pickupPlaceId}
              placeholder="Event or pickup address"
              invalid={Boolean(shown("pickup"))}
              describedBy="book-pickup-error"
              onBlur={() => touch("pickup")}
              onValue={(next, id) => patch({ pickup: next, pickupPlaceId: id })}
            />
            <FieldError id="book-pickup-error" message={shown("pickup")} />
          </label>
          <p className="note">{MILEAGE_RULE_TEXT}</p>
          <p className="mileage-status" aria-live="polite">
            {draft.pickup.trim().length < 4
              ? "Mileage is calculated from the pickup address."
              : mileage?.message || "Checking mileage…"}
          </p>
          <label className="check">
            <input
              type="checkbox"
              name="sameDropoff"
              checked={draft.sameDropoff}
              onChange={(event) => patch({ sameDropoff: event.target.checked })}
            />
            <span>Drop-off is the same as pickup.</span>
          </label>
          {!draft.sameDropoff && (
            <label htmlFor="book-dropoff">
              Drop-off address
              <AddressField
                id="book-dropoff"
                name="dropoff"
                value={draft.dropoff}
                placeId={draft.dropoffPlaceId}
                placeholder="Drop-off address"
                invalid={Boolean(shown("dropoff"))}
                describedBy="book-dropoff-error"
                onBlur={() => touch("dropoff")}
                onValue={(next, id) => patch({ dropoff: next, dropoffPlaceId: id })}
              />
              <FieldError id="book-dropoff-error" message={shown("dropoff")} />
            </label>
          )}
          <SecondCarField checked={draft.secondCar} onChange={(checked) => patch({ secondCar: checked })} />
          <label className="check">
            <input
              type="checkbox"
              name="callMe"
              checked={draft.callMe}
              onChange={(event) => patch({ callMe: event.target.checked })}
            />
            <span>The driver can call me on the day of the event.</span>
          </label>
          <p className="note">Leave this checked to use your name and phone. Uncheck it if a planner or family member should answer instead.</p>
          {!draft.callMe && (
            <DayOfContactFields
              name={draft.dayOfName}
              phone={draft.dayOfPhone}
              role={draft.dayOfRole}
              errors={{
                name: shown("dayOfName"),
                phone: shown("dayOfPhone"),
                role: shown("dayOfRole"),
              }}
              onName={(value) => patch({ dayOfName: value })}
              onPhone={(value) => patch({ dayOfPhone: value })}
              onRole={(value) => patch({ dayOfRole: value })}
              onBlur={(field) => touch(field === "name" ? "dayOfName" : field === "phone" ? "dayOfPhone" : "dayOfRole")}
            />
          )}
        </>
      )}

      {step === "review" && (
        <>
          <dl className="book-summary">
            <SummaryRow label="Car">{carName}</SummaryRow>
            <SummaryRow label="Date" onChange={() => pushStep("when")}>{formatBookDate(draft.date)}</SummaryRow>
            <SummaryRow label="Time" onChange={() => pushStep("when")}>{draft.start ? clockLabel(draft.start) : "Choose a time"}</SummaryRow>
            <SummaryRow label="Hours" onChange={() => pushStep("when")}>{draft.hours} hours</SummaryRow>
            <SummaryRow label="Occasion" onChange={() => pushStep("contact")}>{draft.occasion || "Choose an occasion"}</SummaryRow>
            {draft.occasion === "Wedding" && [draft.partner1Name, draft.partner1Social].some((item) => item.trim()) && (
              <SummaryRow label="Partner 1" onChange={() => pushStep("contact")}>
                {[draft.partner1Name, draft.partner1Social].map((item) => item.trim()).filter(Boolean).join(" · ")}
              </SummaryRow>
            )}
            {draft.occasion === "Wedding" && [draft.partner2Name, draft.partner2Social].some((item) => item.trim()) && (
              <SummaryRow label="Partner 2" onChange={() => pushStep("contact")}>
                {[draft.partner2Name, draft.partner2Social].map((item) => item.trim()).filter(Boolean).join(" · ")}
              </SummaryRow>
            )}
            {draft.occasion === "Wedding" && [draft.photographerName, draft.photographerEmail, draft.photographerInstagram].some((item) => item.trim()) && (
              <SummaryRow label="Photographer" onChange={() => pushStep("contact")}>
                {[draft.photographerName, draft.photographerEmail, draft.photographerInstagram].map((item) => item.trim()).filter(Boolean).join(" · ")}
              </SummaryRow>
            )}
            <SummaryRow label="Name" onChange={() => pushStep("contact")}>{draft.name}</SummaryRow>
            <SummaryRow label="Email" onChange={() => pushStep("contact")}>{draft.email}</SummaryRow>
            <SummaryRow label="Phone" onChange={() => pushStep("contact")}>{draft.phone}</SummaryRow>
            <SummaryRow label="Pickup" onChange={() => pushStep("where")}>{draft.pickup}</SummaryRow>
            <SummaryRow label="Drop-off" onChange={() => pushStep("where")}>
              {draft.sameDropoff ? "Same as pickup" : draft.dropoff}
            </SummaryRow>
            <SummaryRow label="Day-of call" onChange={() => pushStep("where")}>
              {draft.callMe
                ? `${draft.name || "You"} at ${draft.phone || "your phone"}`
                : `${draft.dayOfName} · ${draft.dayOfPhone} · ${draft.dayOfRole}`}
            </SummaryRow>
            {secondCarAddon.enabled && draft.secondCar && (
              <SummaryRow label="Second car" onChange={() => pushStep("where")}>Requested, same hourly rate</SummaryRow>
            )}
          </dl>
          <div className="mileage-line" data-mileage>
            <p>{MILEAGE_RULE_TEXT}</p>
            <p className="mileage-status" aria-live="polite">
              {draft.pickup.trim().length < 4
                ? "Enter the pickup address to calculate mileage."
                : mileage?.message || "Checking mileage…"}
            </p>
            <div className="book-price" data-price-breakdown>
              <p>Listing {usd(money.listing)}.</p>
              <p>Mileage {mileage?.fee == null ? "to be confirmed" : usd(mileage.fee)}.</p>
              <p>Subtotal {usd(money.subtotal)}{mileage?.fee == null ? " before mileage" : ""}.</p>
              <p>Sales tax (10.25%) {usd(money.tax)}.</p>
              <p className="price">Total {usd(money.total)}{mileage?.fee == null ? " before mileage" : ""}.</p>
              <p>Deposit due now {usd(money.deposit)}. Balance {usd(money.balance)} is billed separately.</p>
            </div>
            <p>{CARD_SAVE_TEXT}</p>
          </div>
          <label className="check">
            <input
              id="book-waiver"
              type="checkbox"
              checked={draft.waiver}
              aria-invalid={shown("waiver") ? true : undefined}
              aria-describedby="book-waiver-error"
              onBlur={() => touch("waiver")}
              onChange={(event) => patch({ waiver: event.target.checked })}
            />
            <span>
              {WAIVER_TEXT}{" "}
              <Link href="/rental-terms/">Read the rental terms</Link>
            </span>
          </label>
          <FieldError id="book-waiver-error" message={shown("waiver")} />
          <label className="check">
            <input
              id="book-reliability"
              type="checkbox"
              checked={draft.reliability}
              aria-invalid={shown("reliability") ? true : undefined}
              aria-describedby="book-reliability-error"
              onBlur={() => touch("reliability")}
              onChange={(event) => patch({ reliability: event.target.checked })}
            />
            <span>{RELIABILITY_TEXT}</span>
          </label>
          <FieldError id="book-reliability-error" message={shown("reliability")} />
        </>
      )}

      <p className="book-alert form-error" role={message ? "alert" : undefined} aria-live="polite">{message}</p>
      <div className="book-nav">
        <button className="btn book-pay" type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : step === "review"
              ? `Book with $${DEPOSIT_USD} deposit`
              : returnToReview
                ? "Back to review"
                : "Continue"}
        </button>
        {step !== "when" && (
          <button className="btn btn-quiet book-back" type="button" onClick={back}>Back</button>
        )}
      </div>
      <p className="book-alt">
        <Link href="/quoterequest/">Prefer to talk? Request a quote</Link>
      </p>
    </form>
  );
}

function SummaryRow({ label, onChange, children }: { label: string; onChange?: () => void; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{children}</span>
        {onChange && (
          <button type="button" className="summary-edit" onClick={onChange}>Change</button>
        )}
      </dd>
    </div>
  );
}

const WEDDING_KEYS = [
  "partner1Name",
  "partner1Social",
  "partner2Name",
  "partner2Social",
  "photographerName",
  "photographerEmail",
  "photographerInstagram",
] as const;

function WeddingField({
  id,
  label,
  name,
  value,
  error,
  autoComplete,
  type = "text",
  inputMode,
  onBlur,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  error: string;
  autoComplete: string;
  type?: string;
  inputMode?: "email";
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        name={name}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect={type === "email" ? "off" : undefined}
        spellCheck={type === "email" ? false : undefined}
        enterKeyHint="next"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-error`}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </label>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className="field-error" role={message ? "alert" : undefined}>
      {message}
    </span>
  );
}

function blankDraft(earliest: string): Draft {
  return {
    date: earliest,
    hours: BASE_HOURS,
    start: "",
    name: "",
    email: "",
    phone: "",
    occasion: "",
    partner1Name: "",
    partner1Social: "",
    partner2Name: "",
    partner2Social: "",
    photographerName: "",
    photographerEmail: "",
    photographerInstagram: "",
    secondCar: false,
    pickup: "",
    pickupPlaceId: "",
    dropoff: "",
    dropoffPlaceId: "",
    sameDropoff: true,
    callMe: true,
    dayOfName: "",
    dayOfPhone: "",
    dayOfRole: "",
    waiver: false,
    reliability: false,
  };
}

function readDraft(car: string, earliest: string) {
  try {
    const raw = sessionStorage.getItem(`${BOOKING_DRAFT_PREFIX}${car}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { step?: unknown; furthest?: unknown; draft?: Partial<Draft> };
    const draft = blankDraft(earliest);
    const source = parsed.draft || {};
    if (typeof source.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) && source.date >= earliest) {
      draft.date = source.date;
    }
    if (typeof source.hours === "number" && HOUR_CHOICES.includes(source.hours)) draft.hours = source.hours;
    if (typeof source.start === "string") draft.start = source.start;
    if (typeof source.name === "string") draft.name = source.name;
    if (typeof source.email === "string") draft.email = source.email;
    if (typeof source.phone === "string") draft.phone = source.phone;
    if (typeof source.occasion === "string" && OCCASIONS.includes(source.occasion as (typeof OCCASIONS)[number])) {
      draft.occasion = source.occasion;
    }
    if (typeof source.partner1Name === "string") draft.partner1Name = source.partner1Name;
    if (typeof source.partner1Social === "string") draft.partner1Social = source.partner1Social;
    if (typeof source.partner2Name === "string") draft.partner2Name = source.partner2Name;
    if (typeof source.partner2Social === "string") draft.partner2Social = source.partner2Social;
    if (typeof source.photographerName === "string") draft.photographerName = source.photographerName;
    if (typeof source.photographerEmail === "string") draft.photographerEmail = source.photographerEmail;
    if (typeof source.photographerInstagram === "string") draft.photographerInstagram = source.photographerInstagram;
    if (typeof source.secondCar === "boolean") draft.secondCar = source.secondCar;
    if (typeof source.pickup === "string") draft.pickup = source.pickup;
    if (typeof source.pickupPlaceId === "string") draft.pickupPlaceId = source.pickupPlaceId;
    if (typeof source.dropoff === "string") draft.dropoff = source.dropoff;
    if (typeof source.dropoffPlaceId === "string") draft.dropoffPlaceId = source.dropoffPlaceId;
    if (typeof source.sameDropoff === "boolean") draft.sameDropoff = source.sameDropoff;
    if (typeof source.callMe === "boolean") draft.callMe = source.callMe;
    if (typeof source.dayOfName === "string") draft.dayOfName = source.dayOfName;
    if (typeof source.dayOfPhone === "string") draft.dayOfPhone = source.dayOfPhone;
    if (typeof source.dayOfRole === "string") draft.dayOfRole = source.dayOfRole;
    if (typeof source.waiver === "boolean") draft.waiver = source.waiver;
    if (typeof source.reliability === "boolean") draft.reliability = source.reliability;
    const step = isStep(parsed.step) ? parsed.step : "when";
    const furthest = typeof parsed.furthest === "number"
      ? Math.min(STEPS.length - 1, Math.max(STEPS.indexOf(step), parsed.furthest))
      : STEPS.indexOf(step);
    return { draft, step, furthest };
  } catch {
    return null;
  }
}

function bookingInput(draft: Draft, car: string): BookingInput {
  return {
    car,
    date: draft.date,
    start: draft.start,
    hours: draft.hours,
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
    occasion: draft.occasion,
    pickup: draft.pickup,
    dropoff: draft.sameDropoff ? draft.pickup : draft.dropoff,
    dayOfName: draft.callMe ? draft.name : draft.dayOfName,
    dayOfPhone: draft.callMe ? draft.phone : draft.dayOfPhone,
    dayOfRole: draft.callMe ? "Person who booked" : draft.dayOfRole,
    waiver: draft.waiver,
    reliability: draft.reliability,
  };
}

function weddingInput(draft: Draft): WeddingCelebrationInput {
  return {
    partner1Name: draft.partner1Name,
    partner1Social: draft.partner1Social,
    partner2Name: draft.partner2Name,
    partner2Social: draft.partner2Social,
    photographerName: draft.photographerName,
    photographerEmail: draft.photographerEmail,
    photographerInstagram: draft.photographerInstagram,
  };
}

function weddingFilled(draft: Draft) {
  return WEDDING_KEYS.some((key) => draft[key].trim());
}

function collectErrors(input: BookingInput, open: string[], ready: boolean, wedding: WeddingCelebrationInput) {
  const errors: Record<string, string> = {};
  // Day-of contact is checked after the review checkboxes. Ask again with those
  // accepted so a missing day-of name is not hidden until the last step.
  const candidates = [input, { ...input, waiver: true, reliability: true }];
  for (const candidate of candidates) {
    const result = validateBooking(candidate);
    if (result.ok) continue;
    const field = fieldForError(result.error);
    if (field) errors[field] ||= result.error;
    else errors.form ||= result.error;
  }
  const dayOfFilled = { name: "Day Contact", phone: "3183445001", role: "Planner" };
  const dayOfKeys = [
    ["dayOfName", "name"],
    ["dayOfPhone", "phone"],
    ["dayOfRole", "role"],
  ] as const;
  for (const [key, field] of dayOfKeys) {
    if (errors[key]) continue;
    const result = validateDayOfContact({ ...dayOfFilled, [field]: input[key] });
    if (!result.ok) errors[key] = result.error;
  }
  if (input.occasion === "Wedding") {
    const extra = weddingCelebrationErrors(input.occasion, wedding);
    for (const [key, message] of Object.entries(extra)) errors[key] ||= message;
  }
  if (ready && input.start && !errors.start) {
    const minutes = toMinutes(input.start);
    if (minutes == null || !open.includes(fromMinutes(minutes))) {
      errors.start = "That start time isn’t open for this rental length.";
    }
  }
  return errors;
}

function firstProblem(errors: Record<string, string>) {
  for (const item of STEPS) {
    for (const field of STEP_FIELDS[item]) {
      if (errors[field]) return { step: item, field };
    }
  }
  return null;
}

function fieldForError(error: string) {
  if (error === "Choose a date." || error.startsWith("Reservations must be made")) return "date";
  if (error.startsWith("Choose a whole number of hours")) return "hours";
  if (error === "Choose an open start time." || error.startsWith("That rental would run past midnight")) return "start";
  if (error === "Enter your name.") return "name";
  if (error === "Enter a valid email.") return "email";
  if (error === "Enter a phone number.") return "phone";
  if (error === "Choose an occasion.") return "occasion";
  if (error.includes("partner 1 social")) return "partner1Social";
  if (error.includes("partner 1")) return "partner1Name";
  if (error.includes("partner 2 social")) return "partner2Social";
  if (error.includes("partner 2")) return "partner2Name";
  if (error.includes("photographer email") || error.includes("Photographer email")) return "photographerEmail";
  if (error.includes("Instagram")) return "photographerInstagram";
  if (error.includes("photographer") || error.includes("Photographer")) return "photographerName";
  if (error === "Enter a pickup location.") return "pickup";
  if (error === "Enter a drop-off location.") return "dropoff";
  if (error.includes("day-of contact") && error.includes("name")) return "dayOfName";
  if (error.includes("day-of contact") && error.includes("phone")) return "dayOfPhone";
  if (error.includes("day-of contact")) return "dayOfRole";
  if (error.startsWith("Accept the rental terms")) return "waiver";
  if (error.startsWith("Accept the classic-car reliability")) return "reliability";
  return "";
}

function stepForField(field: string): Step {
  for (const item of STEPS) {
    if (STEP_FIELDS[item].includes(field)) return item;
  }
  return "review";
}

function isStep(value: unknown): value is Step {
  return value === "when" || value === "contact" || value === "where" || value === "review";
}

function historyState() {
  const current = window.history.state;
  if (current && typeof current === "object") return current as Record<string, unknown>;
  return {};
}

function usd(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

function clockValue(value: string) {
  const minutes = toMinutes(value);
  return minutes == null ? "" : fromMinutes(minutes);
}

function clockLabel(value: string) {
  const minutes = toMinutes(value);
  if (minutes == null) return value;
  const hours24 = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 || 12;
  return `${hour12}:${mins} ${period}`;
}

function formatBookDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
