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
