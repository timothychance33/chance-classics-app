import { esc, sendEmail } from "./shared.ts";

/** One-car / multi-car alternate quote email (PR #9). */
export async function handleQuoteAlternatives(body: any) {
  let result;
      const q = body.quote ?? {};
      const to = body.to;
      if (!to) throw new Error("quote_alternatives requires 'to'");
      const money = (n: unknown) => `$${Number(n || 0).toFixed(2)}`;
      const fallbackBook = body.book_url || "https://www.chanceclassics.com/book-online?referral=quote_email";
      const alts = (Array.isArray(q.alternatives) ? q.alternatives : []).filter((a: Record<string, unknown>) =>
        String(a?.name || "").trim().toLowerCase() !== "elvira"
      );
      const one = alts.length === 1;
      const chosen = one ? alts[0] : null;
      const chosenName = chosen ? String(chosen.name || "Classic car") : "";
      const altRows = one && chosen
        ? (() => {
          const href = esc((chosen.book_url as string) || fallbackBook);
          const hasBreakdown = chosen.base_rate != null || chosen.subtotal != null;
          const lines: string[] = [];
          if (hasBreakdown) {
            lines.push(`<tr><td style="padding:6px 14px 6px 0">${esc(chosenName)} — base (up to 2 hours)</td><td style="padding:6px 0;text-align:right">${money(chosen.base_rate)}</td></tr>`);
            if (Number(chosen.overage) > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Additional hours (${esc(chosen.extra_hours)})</td><td style="padding:6px 0;text-align:right">${money(chosen.overage)}</td></tr>`);
            if (Number(chosen.travel) > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Travel (${esc(chosen.miles ?? q.miles)} mi, trailered)</td><td style="padding:6px 0;text-align:right">${money(chosen.travel)}</td></tr>`);
            if (Number(chosen.hotel_fee) > 0) lines.push(`<tr><td style="padding:6px 14px 6px 0">Overnight hotel accommodation</td><td style="padding:6px 0;text-align:right">${money(chosen.hotel_fee)}</td></tr>`);
            lines.push(`<tr><td style="padding:6px 14px 6px 0;border-top:1px solid #ddd">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #ddd">${money(chosen.subtotal)}</td></tr>`);
            lines.push(`<tr><td style="padding:6px 14px 6px 0">Tax</td><td style="padding:6px 0;text-align:right">${money(chosen.tax)}</td></tr>`);
          } else {
            lines.push(`<tr><td style="padding:6px 14px 6px 0;font-weight:700">${esc(chosenName)}</td><td></td></tr>`);
          }
          lines.push(`<tr><td style="padding:8px 14px 8px 0;font-weight:800;font-size:17px">Total</td><td style="padding:8px 0;text-align:right;font-weight:800;font-size:17px">${money(chosen.total)}</td></tr>`);
          return `${lines.join("")}<tr><td colspan="2" style="padding:14px 0 0"><a href="${href}" style="background:#6e1d1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Book ${esc(chosenName)}</a></td></tr>`;
        })()
        : alts.map((a: Record<string, unknown>) => {
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
        : one
          ? `${esc(q.car_name || "The car you asked about")} is already booked${q.event_date ? ` on ${esc(q.event_date)}` : ""}. Same trip details — here's the price for the ${esc(chosenName)}.`
          : `${esc(q.car_name || "The car you asked about")} is already booked${q.event_date ? ` on ${esc(q.event_date)}` : ""}. Same trip details — here are prices for the cars we still have that day.`;
      const heading = one ? "This car is still open" : "A few cars are still open";
      const subject = one
        ? `${chosenName} is still open${q.event_date ? ` — ${q.event_date}` : ""}`
        : `Cars still open${q.event_date ? ` — ${q.event_date}` : ""}`;
      const validLine = q.expires
        ? (one
          ? `This price is good through ${esc(q.expires)}.`
          : `These prices are good through ${esc(q.expires)}.`)
        : "";
      const footer = one
        ? "This is an estimate and doesn't hold a date. Reply if you want this car, or tap Book above."
        : "This is an estimate and doesn't hold a date. Reply and tell us which car you want, or tap Book on one above.";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#21130f">
          <h2 style="color:#6e1d1a">${heading}</h2>
          <p>Hi ${esc(q.customer_name || "there")},</p>
          <p>${intro}</p>
          ${q.event_location ? `<p style="color:#6b6052">${esc(q.event_location)}</p>` : ""}
          <p style="font-size:13px;color:#6b6052">${esc(bits.join(" · "))}</p>
          <table style="border-collapse:collapse;width:100%;margin:14px 0">${altRows}</table>
          ${validLine ? `<p style="color:#b8862c;font-weight:700;font-size:13px">${validLine}</p>` : ""}
          <p style="color:#6b6052;font-size:13px;margin-top:18px">${footer}</p>
          <p style="margin-top:18px">Tim Chance<br>Chance Classics<br>(318) 344-5001</p>
        </div>`;
      result = await sendEmail(to, subject, html);
  return result;
}

/** "Decline: no availability" email (PR #15). Owner-edited note, no Book button. */
export async function handleQuoteDeclined(body: any) {
  const n = body.notice ?? {};
  const to = body.to;
  if (!to) throw new Error("quote_declined requires 'to'");
  const note = String(n.note || "").trim();
  if (!note) throw new Error("quote_declined requires a message");
  const subject = `About your Chance Classics request${n.event_date ? ` — ${n.event_date}` : ""}`;
  const safe = esc(note).replace(/\n/g, "<br>");
  const signoff = /chance classics/i.test(note)
    ? ""
    : `<p style="margin-top:18px">Chance Classics</p>`;
  const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#21130f">
          <p>${safe}</p>
          ${signoff}
        </div>`;
  return await sendEmail(to, subject, html);
}
