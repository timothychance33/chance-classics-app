/** Google Maps embed. No API key. Query is an address already published on the site. */
export function mapEmbedSrc(query: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&hl=en&z=14&output=embed`;
}
