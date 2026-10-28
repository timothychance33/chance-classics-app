"use client";

import { useEffect, useState } from "react";

const HOTEL_CONFIRM_KEY = "chance-classics-hotel-line";

/** Shows the overnight driver hotel line after checkout, then clears it. */
export function HotelConfirmNote() {
  const [note, setNote] = useState("");
  useEffect(() => {
    try {
      const text = sessionStorage.getItem(HOTEL_CONFIRM_KEY) || "";
      if (text) setNote(text);
      sessionStorage.removeItem(HOTEL_CONFIRM_KEY);
    } catch {
      /* Storage can be blocked. The quote and the receipt still list the charge. */
    }
  }, []);
  if (!note) return null;
  return <p className="note" data-hotel-line>{note}</p>;
}
