import Link from "next/link";
import { ClearBookingDraft } from "@/components/ClearBookingDraft";
import { HotelConfirmNote } from "@/components/HotelConfirmNote";
import { CARD_SAVE_TEXT } from "@/lib/booking-rules";
import { PHONE_DISPLAY, PHONE_TEL, pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Booking received | Chance Classics",
  description: "The deposit checkout is finished. The booking is confirmed after Stripe reports the payment.",
  path: "/booking/confirmed",
  noindex: true,
});

export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const paid = (await searchParams).paid;
  const balance = paid === "balance";
  const charge = paid === "charge";
  const title = balance
    ? "Balance checkout finished"
    : charge
      ? "Payment checkout finished"
      : "Deposit checkout finished";
  const lead = balance
    ? "The balance is applied to the booking when the payment notice arrives."
    : charge
      ? "The payment is applied to the booking when the payment notice arrives."
      : "Thanks. The deposit checkout is finished. The booking is confirmed only after the payment notice arrives.";
  return (
    <article className="wrap page system">
      <ClearBookingDraft />
      <h1>{title}</h1>
      <p>{lead}</p>
      <HotelConfirmNote />
      <h2>What happens next</h2>
      {balance ? (
        <ol className="confirm-next">
          <li>The balance is applied to the booking when the payment notice arrives.</li>
          <li>Call or text if you need to check the time, the address, or the amount.</li>
        </ol>
      ) : charge ? (
        <ol className="confirm-next">
          <li>The payment is applied to the booking when the payment notice arrives.</li>
          <li>Call or text if you need a receipt or a change.</li>
        </ol>
      ) : (
        <ol className="confirm-next">
          <li>Chance Classics confirms the booking when the payment notice arrives.</li>
          <li>The rest of the total is billed separately. {CARD_SAVE_TEXT}</li>
          <li>Call or text if the pickup time, address, or day-of contact needs a change.</li>
        </ol>
      )}
      {!balance && !charge && (
        <p className="note">
          A test or preview checkout is marked source site-test in the garage app so it is not treated as a Wix booking.
        </p>
      )}
      <p className="book-nav">
        <a className="btn book-pay" href={`tel:${PHONE_TEL}`}>Call {PHONE_DISPLAY}</a>
      </p>
      <p className="book-alt">
        <Link href="/">Back home</Link>
        {" · "}
        <Link href="/book-online/">Book another car</Link>
      </p>
    </article>
  );
}
