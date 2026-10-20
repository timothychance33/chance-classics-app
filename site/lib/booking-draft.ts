/** Browser-only draft for the book-online form. Cleared after checkout success. */

export const BOOKING_DRAFT_PREFIX = "chance-classics-booking:";

export function clearBookingDrafts() {
  try {
    const drop: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(BOOKING_DRAFT_PREFIX)) drop.push(key);
    }
    for (const key of drop) sessionStorage.removeItem(key);
  } catch {
    /* Private mode can block storage. The form still works. */
  }
}
