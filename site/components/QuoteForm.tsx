"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AddressField } from "@/components/AddressField";
import { MILEAGE_ACK } from "@/lib/booking-rules";
import { quoteServices } from "@/lib/content";

const hear = ["Google / Search Engine", "Wedding Planning Site", "Event Planner", "Event Venue", "Friend / Family", "Other"];

const MILEAGE_TEXT = MILEAGE_ACK;

/**
 * Phase 1 stub. Submit shows the thanks page and does not store the request.
 * Phase 2 should post this payload into the Classics app quote-capture flow.
 */
export function QuoteForm() {
  const router = useRouter();
  const [other, setOther] = useState(false);
  const [mileageError, setMileageError] = useState(false);
  const [location, setLocation] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [dropoffPlaceId, setDropoffPlaceId] = useState("");
  const [mileageNote, setMileageNote] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (!data.get("mileage")) {
      setMileageError(true);
      return;
    }
    router.push("/registrationthanks/");
  }

  useEffect(() => {
    if (location.trim().length < 4) {
      setMileageNote("");
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pickup: location });
      if (placeId) params.set("pickupPlaceId", placeId);
      fetch(`/api/mileage/?${params}`)
        .then((response) => response.json())
        .then((data) => {
          if (!ignore) setMileageNote(data.message || "We'll confirm mileage.");
        })
        .catch(() => {
          if (!ignore) setMileageNote("We'll confirm mileage.");
        });
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [location, placeId]);

  return (
    <form className="quote-form" onSubmit={onSubmit} noValidate={false}>
      <h1>Get a Price Quote</h1>
      <div className="two">
        <label className="field">
          <span>First name</span>
          <input name="first_name" required placeholder="e.g., Emily" autoComplete="given-name" />
        </label>
        <label className="field">
          <span>Last name</span>
          <input name="last_name" required placeholder="e.g., Smith" autoComplete="family-name" />
        </label>
      </div>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required placeholder="e.g., name@example.com" autoComplete="email" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input name="phone" type="tel" placeholder="e.g., 888-888-8888" autoComplete="tel" />
      </label>
      <label className="field">
        <span>Select a Service</span>
        <select name="service" required defaultValue="">
          <option value="" disabled>Choose an option</option>
          {quoteServices.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Type of Event</span>
        <input name="event_type" placeholder="Wedding, Parade, Photo Session, Etc." />
      </label>
      <label className="field">
        <span>Event Date and Time</span>
        <input name="when" type="datetime-local" required />
      </label>
      <label className="field">
        <span>Event Location (With Address)</span>
        <AddressField
          name="location"
          required
          value={location}
          placeId={placeId}
          placeholder="Event or pickup address"
          onValue={(next, id) => {
            setLocation(next);
            setPlaceId(id);
          }}
        />
      </label>
      <label className="field">
        <span>Drop-off address</span>
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
      {location.trim().length >= 4 && (
        <p className="mileage-line" data-mileage>{mileageNote || "Checking mileage…"}</p>
      )}
      <label className="field">
        <span>Give us more details</span>
        <textarea name="details" placeholder="Drop off location, Additional time requested, Multiple stops, etc." />
      </label>
      <label className="field">
        <span>Event Planner</span>
        <input name="planner" />
      </label>
      <fieldset className="radios">
        <legend>How did you hear about us?</legend>
        {hear.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="hear"
              value={option}
              onChange={() => setOther(option === "Other")}
            />
            {option}
          </label>
        ))}
        {other && (
          <label className="field">
            <span>Please tell us where</span>
            <input name="hear_other" />
          </label>
        )}
      </fieldset>
      <div className={mileageError ? "mileage-callout is-error" : "mileage-callout"}>
        <label>
          <input
            name="mileage"
            type="checkbox"
            required
            aria-invalid={mileageError}
            aria-describedby={mileageError ? "mileage-error" : undefined}
            onChange={(event) => {
              if (event.target.checked) setMileageError(false);
            }}
            onInvalid={(event) => {
              event.preventDefault();
              setMileageError(true);
            }}
          />
          <span>{MILEAGE_TEXT}</span>
        </label>
        {mileageError && (
          <p id="mileage-error" className="mileage-error" role="alert">
            Check this box to confirm the mileage charges before requesting a quote.
          </p>
        )}
      </div>
      <button className="quote-submit" type="submit">Request a Quote</button>
    </form>
  );
}
