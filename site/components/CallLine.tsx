import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/content";

export function CallLine({ lead = "Call or text" }: { lead?: string }) {
  return (
    <p className="call-line">
      {lead} <a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a>
    </p>
  );
}
