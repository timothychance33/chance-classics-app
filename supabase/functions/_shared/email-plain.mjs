// Plain-text part for Resend. No secrets and no network.
// HTML-only mail is easier to filter, so every customer send includes text.

export const CUSTOMER_REPLY_TO = "chanceclassics@gmail.com";
export const DEFAULT_FROM_EMAIL = "bookings@chanceclassics.com";

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Visible text plus each link URL on its own line. */
export function htmlToPlainText(html) {
  let source = String(html || "");
  source = source.replace(/<style[\s\S]*?<\/style>/gi, "");
  source = source.replace(/<script[\s\S]*?<\/script>/gi, "");
  source = source.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const url = String(href || "").trim();
    const text = String(label || "").replace(/<[^>]+>/g, "").trim();
    if (!url) return text;
    if (!text || text === url) return url;
    return `${text}\n${url}`;
  });
  source = source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/(tr|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(source)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
