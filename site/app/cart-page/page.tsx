import Link from "next/link";
import { pageMeta } from "@/lib/content";

export const metadata = pageMeta({
  title: "Cart Page | Chance Classics, Classic Car Rental",
  description: "Your Chance Classics cart is empty.",
  path: "/cart-page",
});

export default function CartPage() {
  return (
    <article className="wrap page system">
      <h1>My cart</h1>
      <h2>Cart is empty</h2>
      <p><Link className="btn" href="/">Continue Browsing</Link></p>
    </article>
  );
}
