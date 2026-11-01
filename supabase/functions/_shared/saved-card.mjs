// Monday-before reminder date. Keep in sync with site/lib/saved-card.ts.

function addUtcDays(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Monday the reminder email goes out.
 * Wed–Sun: Monday of that event week.
 * Mon or Tue: the previous week's Monday.
 * The balance is still due the day before the event.
 */
export function balanceReminderMonday(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const dow = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekMonday = addUtcDays(date, -daysFromMonday);
  if (dow === 1 || dow === 2) return addUtcDays(weekMonday, -7);
  return weekMonday;
}

/** Event dates whose reminder Monday is this Monday: Wednesday through the next Tuesday. */
export function reminderEventWindow(mondayIso) {
  return { from: addUtcDays(mondayIso, 2), to: addUtcDays(mondayIso, 8) };
}

function isoDay(value) {
  const day = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/**
 * Catch-up: the reminder Monday has arrived and the event is still today or later.
 * A booking created after that Monday is included on the next run.
 */
export function balanceReminderDue(eventDate, todayIso) {
  const event = isoDay(eventDate);
  const today = isoDay(todayIso);
  if (!event || !today || event < today) return false;
  const monday = balanceReminderMonday(event);
  return Boolean(monday) && today >= monday;
}

/**
 * Dates a catch-up run needs to read: today through the Tuesday after this week's Monday.
 * That Tuesday is the last event whose reminder Monday is already today or earlier.
 * Earlier dates are past and are not emailed.
 */
export function balanceReminderCatchupWindow(todayIso) {
  const today = isoDay(todayIso);
  if (!today) return { from: "", to: "" };
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = addUtcDays(today, -daysFromMonday);
  return { from: today, to: addUtcDays(thisMonday, 8) };
}

function roundedMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Dollars still owed. 0 when amount paid already covers the total, even if a
 * stale balance column is still positive (a manual pay link that was collected).
 */
export function reminderBalanceUsd(row) {
  const total = roundedMoney(row?.total_usd);
  const paid = roundedMoney(row?.amount_paid_usd) ?? 0;
  if (total != null && paid >= total) return 0;
  const listed = roundedMoney(row?.balance_due_usd);
  if (listed != null) return listed;
  if (total == null) return null;
  return Math.round((total - paid) * 100) / 100;
}

const BALANCE_REMINDER_STATUSES = ["confirmed", "prepping", "ready", "out", "completed"];

/** Confirmed pipeline, plus a `new` row that already has a deposit or full payment. */
export function balanceReminderStatusOk(booking) {
  const status = String(booking?.status || "").trim().toLowerCase();
  if (BALANCE_REMINDER_STATUSES.includes(status)) return true;
  const pay = String(booking?.payment_status || "").trim().toLowerCase();
  return status === "new" && (pay === "deposit" || pay === "paid");
}

/**
 * Customer wording for when the balance is due.
 * The due date stays the day before the event.
 * Today: that day has already arrived, so say due today.
 * Tomorrow: the day before is today.
 * Omit today and callers keep the ordinary "day before" sentence.
 */
export function balanceDuePhrase(eventDate, todayIso) {
  const event = isoDay(eventDate);
  const today = isoDay(todayIso);
  if (!event || !today) return "the day before your event";
  if (event <= today) return "today";
  if (event === addUtcDays(today, 1)) return "today, the day before your event";
  return "the day before your event";
}

export function balanceCheckoutDuePhrase(eventDate, todayIso) {
  return balanceDuePhrase(eventDate, todayIso).replace(/your event/g, "the event");
}
