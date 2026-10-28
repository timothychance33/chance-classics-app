// Owner "new booking" email. No secrets and no network.
// send-notification and node tests both import this.

export function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}

function oneLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function weddingLine(name, social) {
  return [oneLine(name), oneLine(social)].filter(Boolean).join(" · ");
}

function moneyNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatClock(value) {
  const text = oneLine(value);
  if (!text) return "";
  if (/[ap]m/i.test(text)) return text.replace(/\s*([ap]m)/i, (_, ap) => ` ${ap.toUpperCase()}`);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function clockMinutes(value) {
  const text = oneLine(value);
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const pm = ampm[3].toLowerCase() === "pm";
    if (hours === 12) hours = pm ? 12 : 0;
    else if (pm) hours += 12;
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function bookingWhen(booking) {
  const start = formatClock(booking?.start_time);
  const end = formatClock(booking?.end_time);
  if (start && end) {
    const startMin = clockMinutes(booking?.start_time);
    const endMin = clockMinutes(booking?.end_time);
    const nextDay = startMin != null && endMin != null && endMin <= startMin;
    return nextDay ? `${start} – ${end} the next day` : `${start} – ${end}`;
  }
  return start || end;
}

export function bookingPriceText(booking) {
  const direct = moneyNumber(booking?.price ?? booking?.total_usd ?? booking?.total);
  if (direct != null) return `$${direct.toFixed(2)}`;
  const notes = String(booking?.notes || "");
  const patterns = [
    /Price:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
    /Booking total:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
    /Quote total:\s*\$([0-9]+(?:\.[0-9]+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    const amount = match ? moneyNumber(match[1]) : null;
    if (amount != null) return `$${amount.toFixed(2)}`;
  }
  return "";
}

export function bookingPlannerText(booking) {
  const direct = oneLine(booking?.planner);
  if (direct) return direct;
  const notes = String(booking?.notes || "");
  const line = notes.match(/^Event Planner(?: Name and Contact Info)?:\s*(.+)$/im);
  if (line && oneLine(line[1])) return oneLine(line[1]);
  const role = oneLine(booking?.day_of_contact_role);
  if (/planner/i.test(role)) {
    return [booking?.day_of_contact_name, booking?.day_of_contact_phone, role].map(oneLine).filter(Boolean).join(" · ");
  }
  return "";
}

export function bookingEventLocation(booking) {
  const direct = oneLine(booking?.event_location);
  if (direct) return direct;
  const notes = String(booking?.notes || "");
  const line = notes.match(/^Event Location:\s*(.+)$/im);
  return line ? oneLine(line[1]) : "";
}

export function ownerBookingCreatedSubject(booking) {
  const who = oneLine(booking?.customer_name);
  const when = oneLine(booking?.event_date);
  const tail = [who, when].filter(Boolean).join(" / ");
  return tail ? `New Chance Classics booking — ${tail}` : "New Chance Classics booking";
}

export function ownerBookingCreatedRows(booking) {
  const pickup = oneLine(booking?.pickup_location);
  const eventLocation = bookingEventLocation(booking);
  const samePlace = pickup && eventLocation && pickup.toLowerCase() === eventLocation.toLowerCase();
  const rows = [
    ["Booking id", oneLine(booking?.id)],
    ["Client", oneLine(booking?.customer_name)],
    ["Phone", oneLine(booking?.customer_phone)],
    ["Email", oneLine(booking?.customer_email)],
    ["Car", oneLine(booking?.car_name)],
    ["Date", oneLine(booking?.event_date)],
    ["Time", bookingWhen(booking)],
  ];
  if (samePlace) rows.push(["Pickup / event location", pickup]);
  else {
    if (pickup) rows.push(["Pickup", pickup]);
    if (eventLocation) rows.push(["Event location", eventLocation]);
    if (!pickup && !eventLocation) {
      const dropoff = oneLine(booking?.return_location);
      if (dropoff) rows.push(["Pickup / event location", dropoff]);
    }
  }
  rows.push(["Price", bookingPriceText(booking)]);
  const hotelNote = String(booking?.notes || "").match(/^Overnight driver hotel:\s*(.+)$/im);
  if (hotelNote) rows.push(["Overnight driver hotel", hotelNote[1].trim()]);
  rows.push(["Planner", bookingPlannerText(booking)]);
  rows.push(["Bride / partner 1", weddingLine(booking?.wedding_partner_1_name, booking?.wedding_partner_1_social)]);
  rows.push(["Groom / partner 2", weddingLine(booking?.wedding_partner_2_name, booking?.wedding_partner_2_social)]);
  rows.push(["Photographer", oneLine(booking?.wedding_photographer_name)]);
  rows.push(["Photographer email", oneLine(booking?.wedding_photographer_email)]);
  rows.push(["Photographer Instagram", oneLine(booking?.wedding_photographer_instagram)]);
  return rows.filter(([, value]) => value);
}

export function ownerBookingCreatedHtml(booking, appUrl) {
  const rows = ownerBookingCreatedRows(booking)
    .map(([label, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`,
    )
    .join("");
  const link = oneLine(appUrl);
  const button = link
    ? `<p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">New booking</h2>
    <p>A Chance Classics booking was just created.</p>
    <table style="border-collapse:collapse;margin:14px 0">${rows}</table>
    ${button}
  </div>`;
}

/** Hold and cancelled rows are not a booking Tim needs. A stamp means the email already went out. */
export function shouldEmailOwnerAboutBooking(row) {
  if (!row || row.owner_notified_at) return false;
  const status = String(row.status || "").trim().toLowerCase();
  if (!status || status === "hold" || status === "cancelled") return false;
  return true;
}

function uniqueIds(values) {
  const out = [];
  for (const value of values) {
    const id = oneLine(value);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Checkout and off-session payments. The same charge recorded twice shares one of these ids. */
export function paymentNoticeIds(input) {
  const source = input || {};
  return uniqueIds([source.eventId, source.paymentIntentId, source.sessionId, source.chargeId]);
}

/** A failed attempt must not consume the payment-intent id a later success would use. */
export function failedChargeNoticeIds(paymentIntentId) {
  const id = oneLine(paymentIntentId);
  return id ? [`failed:${id}`] : [];
}

/** One id per refund. A second refund on the same charge still sends. */
export function refundNoticeIds(input) {
  const source = input || {};
  const refundId = oneLine(source.refundId);
  const eventId = oneLine(source.eventId);
  if (refundId) return uniqueIds([refundId, eventId ? `${eventId}:${refundId}` : ""]);
  const chargeId = oneLine(source.chargeId);
  if (chargeId && source.amountRefundedCents != null && source.amountRefundedCents !== "") {
    return uniqueIds([`refund:${chargeId}:${source.amountRefundedCents}`, eventId]);
  }
  return uniqueIds([eventId]);
}

export function formatMoney(value) {
  if (value == null || value === "") return "";
  const n = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n * 100) / 100).toFixed(2)}`;
}

export function ownerMoneyReasonText(money) {
  const reason = oneLine(money?.reason).toLowerCase();
  const chargeReason = oneLine(money?.chargeReason).toLowerCase();
  const which = chargeReason ? ` (${chargeReason})` : "";
  if (reason === "failed") return `Charge failed${which}`;
  if (reason === "refund") return `Refund${which}`;
  if (reason === "deposit") return "Deposit";
  if (reason === "balance") return "Balance";
  if (reason === "overage") return "Overage";
  if (reason === "damage") return "Damage";
  if (reason === "pay_link") return `Pay link${which}`;
  return oneLine(money?.reason) || "Payment";
}

function detailRows(booking) {
  const rows = ownerBookingCreatedRows(booking);
  const status = oneLine(booking?.status);
  if (status) rows.push(["Status", status]);
  const paid = formatMoney(booking?.amount_paid ?? booking?.amount_paid_usd);
  if (paid) rows.push(["Amount paid", paid]);
  const balance = formatMoney(booking?.balance ?? booking?.balance_due);
  if (balance) rows.push(["Balance", balance]);
  return rows;
}

function tableRows(rows) {
  return rows
    .map(([label, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`,
    )
    .join("");
}

function appLink(appUrl) {
  const link = oneLine(appUrl);
  return link
    ? `<p><a href="${esc(link)}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app</a></p>`
    : "";
}

function changeIsCancelled(changes) {
  return (Array.isArray(changes) ? changes : []).some((change) => /cancel|delet/i.test(oneLine(change?.to)));
}

export function ownerBookingChangedSubject(booking, changes) {
  const head = changeIsCancelled(changes) ? "Chance Classics booking cancelled" : "Chance Classics booking changed";
  const tail = [oneLine(booking?.customer_name), oneLine(booking?.event_date)].filter(Boolean).join(" / ");
  return tail ? `${head} — ${tail}` : head;
}

export function ownerBookingChangedHtml(booking, changes, appUrl) {
  const cancelled = changeIsCancelled(changes);
  const changeRows = (Array.isArray(changes) ? changes : [])
    .map((change) => {
      const label = oneLine(change?.label);
      const from = oneLine(change?.from) || "—";
      const to = oneLine(change?.to) || "—";
      if (!label) return "";
      return `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;font-size:14px"><s style="color:#9aa7b4">${esc(from)}</s> → <b>${esc(to)}</b></td></tr>`;
    })
    .join("");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">${cancelled ? "Booking cancelled" : "Booking changed"}</h2>
    <p>${cancelled ? "A Chance Classics booking was cancelled." : "A Chance Classics booking was edited."}</p>
    <table style="border-collapse:collapse;margin:14px 0">${changeRows}</table>
    <table style="border-collapse:collapse;margin:14px 0">${tableRows(detailRows(booking))}</table>
    ${appLink(appUrl)}
  </div>`;
}

export function ownerBookingMoneySubject(booking, money) {
  const tail = [ownerMoneyReasonText(money), oneLine(booking?.customer_name), oneLine(booking?.event_date)].filter(Boolean).join(" / ");
  return tail ? `Chance Classics payment — ${tail}` : "Chance Classics payment";
}

export function ownerBookingMoneyRows(money) {
  const paid = formatMoney(money?.amountPaid ?? money?.amount_paid);
  const balance = formatMoney(money?.balance);
  return [
    ["Amount", formatMoney(money?.amount) || "—"],
    ["Reason", ownerMoneyReasonText(money)],
    ["Amount paid", paid || "—"],
    ["Balance", balance || "—"],
  ];
}

export function ownerBookingMoneyHtml(booking, money, appUrl) {
  const reason = oneLine(money?.reason).toLowerCase();
  const intro = reason === "failed"
    ? "A saved-card charge did not go through. Amount paid and balance did not change."
    : reason === "refund"
      ? "A refund was recorded on this booking. Amount paid and balance below are the new totals."
      : reason === "pay_link"
        ? "A pay link was emailed to the customer. Amount paid and balance do not change until they pay."
        : "A payment was recorded on this booking. Amount paid and balance below are the new totals.";
  const detail = oneLine(money?.detail);
  const detailHtml = detail ? `<p style="color:#6b6052">${esc(detail)}</p>` : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
    <h2 style="color:#6e1d1a">${esc(ownerMoneyReasonText(money))}</h2>
    <p>${intro}</p>
    ${detailHtml}
    <table style="border-collapse:collapse;margin:14px 0">${tableRows(ownerBookingMoneyRows(money))}</table>
    <table style="border-collapse:collapse;margin:14px 0">${tableRows(detailRows(booking))}</table>
    ${appLink(appUrl)}
  </div>`;
}
