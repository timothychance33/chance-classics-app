import { agreements } from "@/lib/content";

export function sharedTerms() {
  return agreements.patsy.blocks.filter((block) => {
    if (block.type !== "p") return false;
    if (block.text.startsWith("Current Price")) return false;
    if (block.text.includes("maximum capacity")) return false;
    if (block.text.startsWith("PATSY CLIENT AGREEMENT")) return false;
    return true;
  });
}

export function carCapacity(slug: string) {
  const agreement = agreements[slug];
  const block = agreement?.blocks.find((item) => item.type === "p" && item.text.includes("maximum capacity"));
  return block && block.type === "p" ? block.text : null;
}

export function agreementBasePrice(slug: string) {
  const agreement = agreements[slug];
  const block = agreement?.blocks.find((item) => item.type === "p" && item.text.startsWith("Current Price"));
  if (!block || block.type !== "p") return null;
  const match = block.text.match(/\$(\d+) for the first 2 hours/);
  return match ? Number(match[1]) : null;
}
