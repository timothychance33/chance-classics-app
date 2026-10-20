/** Filename dumps and empty labels are not descriptions. */
export function isWeakAlt(alt: string | null | undefined) {
  const text = String(alt || "").trim();
  if (!text) return true;
  if (/\.(jpe?g|png|heic|webp|gif|tiff?)$/i.test(text)) return true;
  if (/^(img|dsc|pxl|image)[_\-\s]?\d+/i.test(text)) return true;
  if (/^img_/i.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(text)) return true;
  if (/^\d{4}-\d{2}-\d{2}[_\s]/.test(text)) return true;
  if (/^[0-9a-f]{16,}(\.[a-z0-9]+)?$/i.test(text)) return true;
  if (/^starting at \$/i.test(text)) return true;
  if (/^allimages/i.test(text)) return true;
  if (text === "Chance Classics") return true;
  return false;
}

export function descriptiveAlt(alt: string | null | undefined, fallback: string) {
  return isWeakAlt(alt) ? fallback : String(alt).trim();
}
