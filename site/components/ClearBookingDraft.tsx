"use client";

import { useEffect } from "react";
import { clearBookingDrafts } from "@/lib/booking-draft";

/** Checkout finished, so a later visit should start a new booking. */
export function ClearBookingDraft() {
  useEffect(() => {
    clearBookingDrafts();
  }, []);
  return null;
}
