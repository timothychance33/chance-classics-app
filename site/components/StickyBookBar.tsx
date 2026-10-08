import Link from "next/link";
import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/content";

export function StickyBookBar({ bookHref }: { bookHref?: string }) {
  return (
    <div className="book-bar">
      {bookHref ? <a href={bookHref}>Book</a> : <Link href="/quoterequest/">Request a quote</Link>}
      <a href={`tel:${PHONE_TEL}`}>Call {PHONE_DISPLAY}</a>
    </div>
  );
}
