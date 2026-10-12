import Link from "next/link";
import { BookLink } from "@/components/BookLink";
import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/content";

export function StickyBookBar({ bookHref }: { bookHref?: string }) {
  return (
    <div className="book-bar">
      {bookHref ? <BookLink href={bookHref}>Book</BookLink> : <Link href="/quoterequest/">Request a quote</Link>}
      <a href={`tel:${PHONE_TEL}`}>Call {PHONE_DISPLAY}</a>
    </div>
  );
}
