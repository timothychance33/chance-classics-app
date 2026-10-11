import { redirect } from "next/navigation";
import { termsNav } from "@/lib/content";

export function generateStaticParams() {
  return termsNav.map((car) => ({ slug: car.slug }));
}

export default function OldAgreementPage() {
  redirect("/rental-terms/");
}
