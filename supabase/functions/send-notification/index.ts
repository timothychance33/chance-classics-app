// ============================================================
// Chance Classics — Send Notification (Supabase Edge Function)
// Sends emails via Resend for:
//   type "offer"              -> tell the driver whose turn it is that a job awaits
//   type "claimed"            -> tell the owner a driver claimed a job
//   type "passed"             -> tell the owner a driver passed
//   type "reoffer"            -> open-to-all re-offer to a driver
//   type "quote" / "quote_reminder" / "unavailable" / "quote_alternatives"
//   type "booking_updated"    -> assigned driver: something they care about changed
//   type "booking_assigned"   -> driver was put on a booking
//   type "booking_unassigned" -> driver was taken off a booking
//
// Deploy: supabase functions deploy send-notification
//   Settings -> turn OFF "Verify JWT" (same as today).
//   Secrets already used by this function:
//     RESEND_API_KEY, NOTIFY_SECRET, OWNER_EMAIL, FROM_EMAIL, APP_URL
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "chanceclassics@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@chanceclassics.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.chanceclassics.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: unknown) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c] as string));
}

async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: `Chance Classics <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Resend ${r.status}: ${t}`);
  }
  return await r.json();
}

function bookingBlock(b: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Customer", b.customer_name],
    ["Event", b.event_type],
    ["Date", b.event_date],
    ["Time", b.start_time],
    ["Car", b.car_name],
    ["Pickup", b.pickup_location],
    ["Drop-off", b.return_location],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px">${k}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>`)
    .join("");
}

function driverBookingBlock(b: Record<string, unknown>) {
  const time = [b.start_time, b.end_time].filter(Boolean).join(" – ");
  const rows: [string, unknown][] = [
    ["Customer", b.customer_name],
    ["Event", b.event_type],
    ["Date", b.event_date],
    ["Time", time || b.start_time],
    ["Car", b.car_name],
    ["Pickup", b.pickup_location],
    ["Drop-off", b.return_location],
    ["Phone", b.customer_phone],
    ["Email", b.customer_email],
    ["Notes", b.notes],
    ["Status", b.status],
  ];
  let html = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;font-weight:600;white-space:pre-line">${esc(v)}</td></tr>`)
    .join("");
  if (b.needs_trailer) {
    html += `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px">Trailer</td><td style="padding:4px 0;font-weight:600">Yes — car must be trailered</td></tr>`;
  }
  return html;
}

function wrap(inner: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">${inner}</div>`;
}

function appButton(label: string) {
  return `<p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">${esc(label)}</a></p>`;
}

function payLine(pay: unknown) {
  if (pay == null || pay === "") return "";
  return `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You earn $${esc(pay)}</p>`;
}

function bookingTitle(b: Record<string, unknown>) {
  const who = b.customer_name || b.event_type || "Booking";
  const when = b.event_date ? ` — ${b.event_date}` : "";
  return `${who}${when}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const provided = req.headers.get("x-notify-secret") || url.searchParams.get("secret") || "";
    if (NOTIFY_SECRET && provided !== NOTIFY_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type;
    const b = body.booking ?? {};
    const pay = body.pay;
    const driverName = body.driver_name ?? "Driver";
    const driverEmail = body.driver_email;

    let result;
    if (type === "offer") {
      if (!driverEmail) throw new Error("offer requires driver_email");
      const subject = `New rental available to claim — ${b.event_date ?? ""}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#6e1d1a">A rental is available for you</h2>
          <p>Hi ${driverName}, a booking has been offered to you. You're next in line — claim it or pass to the next driver.</p>
          ${pay != null ? `<p style="font-size:18px;font-weight:700;color:#3c6b4f">You'd earn $${pay}</p>` : ""}
          <table style="border-collapse:collapse;margin:14px 0">${bookingBlock(b)}</table>
          <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Open the app to Claim or Pass</a></p>
          <p style="color:#6b6052;font-size:13px">Log in at <a href="${APP_URL}">${APP_URL}</a> with your email and password. On the Schedule tab you'll see this job with Claim and Pass buttons. If you don't claim it, please Pass so it moves to the next driver.</p>
        </div>`;
      result = await sendEmail(driverEmail, subject, html);
    } else if (type === "unavailable") {
      const n = body.notice ?? {};
      const to = body.to;
      if (!to) throw new Error("unavailable requires 'to'");
      const subject = `About your ${n.car_name ?? "car"} request${n.event_date ? ` — ${n.event_date}` : ""}`;
      const altList = Array.isArray(n.alternatives) && n.alternatives.length
        ? `<ul style="margin:10px 0;padding-left:20px">${n.alternatives.map((a: string) => `<li>${a}</li>`).join("")}</ul>`
        : "";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">Thanks for reaching out!</h2>
          <p>Hi ${n.customer_name ?? "there"},</p>
          <p>${n.note ? n.note.replace(/\n/g, "<br>") : `Unfortunately ${n.car_name ?? "that car"} is already booked on ${n.event_date ?? "that date"}.`}</p>
          ${altList}
          <p>Just reply to this email and let us know if you'd like more info or a quote for one of these — we'd love to help make your day special.</p>
          <p style="margin-top:18px">Tim Chance<br>Chance Classics<br>(318) 344-5001</p>
        </div>`;
      result = await sendEmail(to, subject, html);
    } else if (type === "quote_reminder") {
      const q = body.quote ?? {};
      const to = body.to;
      if (!to) throw new Error("quote_reminder requires 'to'");
      const bookUrl = body.book_url || "https://www.chanceclassics.com/book-online?referral=quote_email";
      const money = (n: unknown) => `$${Number(n || 0).toFixed(2)}`;
      const subject = `Still interested? Your Chance Classics quote${q.event_date ? ` — ${q.event_date}` : ""}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">Just checking in!</h2>
          <p>Hi ${q.customer_name ?? "there"}, we wanted to follow up on the quote we sent for${q.car_name ? ` the ${q.car_name}` : " your event"}${q.event_date ? ` on ${q.event_date}` : ""}.</p>
          ${q.car_name || q.event_location ? `<p><b>${q.car_name ?? ""}</b>${q.event_location ? ` · ${q.event_location}` : ""}</p>` : ""}
          ${q.total ? `<p style="font-size:18px;font-weight:800">Total: ${money(q.total)}</p>` : ""}
          <p>Dates for classic cars can book up quickly, so if you're still interested, we'd love to lock in your date.</p>
          <p><a href="${bookUrl}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Book now</a></p>
          <p style="color:#6b6052;font-size:13px;margin-top:18px">Have questions, or need the quote adjusted? Just reply to this email.</p>
        </div>`;
      result = await sendEmail(to, subject, html);
    } else if (type === "quote") {
      const q = body.quote ?? {};
      const to = body.to;
      if (!to) throw new Error("quote requires 'to'");
      const money = (n: unknown) => `$${Number(n || 0).toFixed(2)}`;
      const bookUrl = body.book_url || "https://www.chanceclassics.com/book-online?referral=quote_email";
      const lines: string[] = [];
      lines.push(`<tr><td style="padding:6px 14px 6px 0">${q.car_name ?? "Classic car"} — base (up to 2 hours)</td><td style="padding:6px 0;text-align:right">${money(q.base_rate)}</td></tr>`);
      if (q.overage > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Additional hours (${q.extra_hours})</td><td style="padding:6px 0;text-align:right">${money(q.overage)}</td></tr>`);
      if (q.travel > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Travel (${q.miles} mi, trailered)</td><td style="padding:6px 0;text-align:right">${money(q.travel)}</td></tr>`);
      if (q.hotel_fee > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Overnight hotel accommodation</td><td style="padding:6px 0;text-align:right">${money(q.hotel_fee)}</td></tr>`);
      lines.push(`<tr><td style="padding:6px 14px 6px 0;border-top:1px solid #ddd">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #ddd">${money(q.subtotal)}</td></tr>`);
      lines.push(`<tr><td style="padding:6px 14px 6px 0">Tax</td><td style="padding:6px 0;text-align:right">${money(q.tax)}</td></tr>`);
      lines.push(`<tr><td style="padding:8px 14px 8px 0;font-weight:800;font-size:17px">Total</td><td style="padding:8px 0;text-align:right;font-weight:800;font-size:17px">${money(q.total)}</td></tr>`);
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">Your Chance Classics quote</h2>
          <p>Hi ${q.customer_name ?? "there"}, thank you for your interest! Here is your quote${q.event_date ? ` for ${q.event_date}` : ""}:</p>
          ${q.car_name ? `<p><b>${q.car_name}</b>${q.event_location ? ` · ${q.event_location}` : ""}</p>` : ""}
          <table style="border-collapse:collapse;width:100%;margin:14px 0">${lines.join("")}</table>
          ${q.quote_notes ? `<p style="color:#6b6052">${q.quote_notes}</p>` : ""}
          ${q.expires ? `<p style="color:#b8862c;font-weight:700;font-size:13px">This quote is valid through ${q.expires}.</p>` : ""}
          <p style="margin-top:20px">Ready to book? Reserve your date for the ${q.car_name ?? "car"} here:</p>
          <p><a href="${bookUrl}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Book ${q.car_name ?? "online"}</a></p>
          <p style="color:#6b6052;font-size:13px;margin-top:18px">This quote is an estimate and does not reserve your date. Questions? Just reply to this email.</p>
        </div>`;
      result = await sendEmail(to, `Your Chance Classics quote${q.event_date ? ` — ${q.event_date}` : ""}`, html);
    } else if (type === "quote_alternatives") {
      const q = body.quote ?? {};
      const to = body.to;
      if (!to) throw new Error("quote_alternatives requires 'to'");
      const money = (n: unknown) => `$${Number(n || 0).toFixed(2)}`;
      const fallbackBook = body.book_url || "https://www.chanceclassics.com/book-online?referral=quote_email";
      const alts = Array.isArray(q.alternatives) ? q.alternatives : [];
      const altRows = alts.map((a: Record<string, unknown>) => {
        const href = esc((a.book_url as string) || fallbackBook);
        return `<tr>
          <td style="padding:10px 14px 10px 0;border-bottom:1px solid #eee;vertical-align:top">
            <div style="font-weight:700">${esc(a.name || "Classic car")}</div>
            <a href="${href}" style="color:#6e1d1a;font-size:13px">Book this car</a>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:800;white-space:nowrap">${money(a.total)}</td>
        </tr>`;
      }).join("");
      const bits: string[] = [];
      if (q.hours) bits.push(`${q.hours} hours`);
      if (q.miles) bits.push(`${q.miles} mi trailered`);
      if (Number(q.hotel_fee) > 0) bits.push("overnight hotel");
      bits.push("tax included");
      const intro = q.note
        ? esc(q.note).replace(/\n/g, "<br>")
        : `${esc(q.car_name || "The car you asked about")} is already booked${q.event_date ? ` on ${esc(q.event_date)}` : ""}. Same trip details — here are prices for the cars we still have that day.`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">A few cars are still open</h2>
          <p>Hi ${esc(q.customer_name || "there")},</p>
          <p>${intro}</p>
          ${q.event_location ? `<p style="color:#6b6052">${esc(q.event_location)}</p>` : ""}
          <p style="font-size:13px;color:#6b6052">${esc(bits.join(" · "))}</p>
          <table style="border-collapse:collapse;width:100%;margin:14px 0">${altRows}</table>
          ${q.expires ? `<p style="color:#b8862c;font-weight:700;font-size:13px">These prices are good through ${esc(q.expires)}.</p>` : ""}
          <p style="color:#6b6052;font-size:13px;margin-top:18px">This is an estimate and doesn't hold a date. Reply and tell us which car you want, or tap Book on one above.</p>
          <p style="margin-top:18px">Tim Chance<br>Chance Classics<br>(318) 344-5001</p>
        </div>`;
      result = await sendEmail(to, `Cars still open${q.event_date ? ` — ${q.event_date}` : ""}`, html);
    } else if (type === "reoffer") {
      if (!driverEmail) throw new Error("reoffer requires driver_email");
      const subject = `🏷️ New pay rate! Rental up for grabs — ${b.event_date ?? ""}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#b8862c">Check out this booking — now with a new pay rate!</h2>
          <p>Hi ${driverName}, this rental is open to <b>all drivers</b> — first to claim it gets it.</p>
          ${pay != null ? `<p style="font-size:20px;font-weight:800;color:#3c6b4f">Now paying $${pay}</p>` : ""}
          <table style="border-collapse:collapse;margin:14px 0">${bookingBlock(b)}</table>
          <p><a href="${APP_URL}" style="background:#6e1d1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Claim it before someone else does</a></p>
        </div>`;
      result = await sendEmail(driverEmail, subject, html);
    } else if (type === "claimed" || type === "passed") {
      const verb = type === "claimed" ? "claimed" : "passed on";
      const subject = `${driverName} ${verb} a booking — ${b.event_date ?? ""}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#6e1d1a">${driverName} ${verb} a booking</h2>
          <table style="border-collapse:collapse;margin:14px 0">${bookingBlock(b)}</table>
          ${type === "passed" ? `<p style="color:#6b6052">It's been offered to the next driver in line.</p>` : ""}
          <p><a href="${APP_URL}">Open the app</a></p>
        </div>`;
      result = await sendEmail(OWNER_EMAIL, subject, html);
    } else if (type === "booking_updated") {
      if (!driverEmail) {
        console.log("booking_updated skipped: no driver_email");
        return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const changes = Array.isArray(body.changes) ? body.changes : [];
      const changeRows = changes.length
        ? `<table style="border-collapse:collapse;margin:12px 0">${
          changes.map((c: { label?: string; from?: string; to?: string }) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#6b6052;font-size:13px;vertical-align:top">${esc(c.label)}</td><td style="padding:4px 0;font-size:14px"><s style="color:#9aa7b4">${esc(c.from)}</s> → <b>${esc(c.to)}</b></td></tr>`
          ).join("")
        }</table>`
        : "";
      const subject = body.subject || `Booking updated: ${bookingTitle(b)}`;
      const html = wrap(`
        <h2 style="color:#6e1d1a">This booking changed</h2>
        <p>Hi ${esc(driverName)}, a job on your schedule was updated. Here's what changed — you don't have to open the app to see the new plan.</p>
        ${changeRows}
        ${payLine(pay)}
        <table style="border-collapse:collapse;margin:14px 0">${driverBookingBlock(b)}</table>
        ${appButton("Open the app")}
      `);
      result = await sendEmail(driverEmail, subject, html);
    } else if (type === "booking_assigned") {
      if (!driverEmail) {
        console.log("booking_assigned skipped: no driver_email");
        return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const subject = body.subject || `You're on a booking: ${bookingTitle(b)}`;
      const html = wrap(`
        <h2 style="color:#6e1d1a">You're on this booking</h2>
        <p>Hi ${esc(driverName)}, this job was assigned to you.</p>
        ${payLine(pay)}
        <table style="border-collapse:collapse;margin:14px 0">${driverBookingBlock(b)}</table>
        ${appButton("Open the app")}
      `);
      result = await sendEmail(driverEmail, subject, html);
    } else if (type === "booking_unassigned") {
      if (!driverEmail) {
        console.log("booking_unassigned skipped: no driver_email");
        return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const subject = body.subject || `You're off a booking: ${bookingTitle(b)}`;
      const html = wrap(`
        <h2 style="color:#6e1d1a">You're no longer on this booking</h2>
        <p>Hi ${esc(driverName)}, you were taken off this job. You don't need to show up for it.</p>
        <table style="border-collapse:collapse;margin:14px 0">${driverBookingBlock(b)}</table>
        ${appButton("Open the app")}
      `);
      result = await sendEmail(driverEmail, subject, html);
    } else {
      throw new Error("unknown type");
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-notification error:", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
