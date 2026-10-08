"use client";

import { useState, type FormEvent } from "react";
import { EMAIL } from "@/lib/content";

/**
 * FLAG: mailto fallback. The public site saves quotes and bookings in
 * Supabase and does not send mail. Garage email goes through
 * send-notification, which needs a signed-in garage session or
 * NOTIFY_SECRET. This project does not have that secret, and no new
 * env var was added. The form opens the visitor's email app to Tim.
 */
export function PlannerForm() {
  const [opened, setOpened] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const business = String(data.get("business") || "").trim();
    const role = String(data.get("role") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const message = String(data.get("message") || "").trim();
    const body = [
      `Name: ${name}`,
      `Business: ${business}`,
      `Role: ${role}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      "",
      message,
    ].join("\n");
    const href = `mailto:${EMAIL}?subject=${encodeURIComponent("Planner, venue, or photographer")}&body=${encodeURIComponent(body)}`;
    setOpened(true);
    window.location.href = href;
  }

  return (
    <form className="book-form" onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input name="name" required autoComplete="name" />
      </label>
      <label className="field">
        <span>Business</span>
        <input name="business" required />
      </label>
      <label className="field">
        <span>Role</span>
        <input name="role" required placeholder="Planner, venue, or photographer" />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input name="phone" type="tel" required autoComplete="tel" />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea name="message" required rows={5} />
      </label>
      <button className="btn" type="submit">Email Tim</button>
      {opened && (
        <p>
          If your email app did not open, write <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>
      )}
    </form>
  );
}
