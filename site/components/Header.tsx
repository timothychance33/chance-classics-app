"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FACEBOOK, FACEBOOK_ICON, LOGO } from "@/lib/content";

const links = [
  { href: "/", label: "Home" },
  { href: "/about/", label: "About" },
  { href: "/services/", label: "Services" },
  { href: "/portfolio/", label: "Cars" },
];

function current(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <header className="site-header">
      <Link href="/" className="logo" onClick={close}>
        <img src={LOGO} alt="Chance Classics" width={513} height={255} />
      </Link>
      <p className="tagline">Classic and Luxury Car Rental</p>
      <button
        className="menu-btn"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bars" />
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      <nav id="site-nav" className={open ? "site-nav open" : "site-nav"} aria-label="Primary">
        <ul className="nav-list">
          {links.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={current(pathname, item.href) ? "page" : undefined} onClick={close}>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/quoterequest/" aria-current={current(pathname, "/quoterequest/") ? "page" : undefined} onClick={close}>
              Request a Quote
            </Link>
          </li>
          <li>
            <Link href="/book-online/" aria-current={current(pathname, "/book-online/") ? "page" : undefined} onClick={close}>
              Book Online
            </Link>
          </li>
          <li>
            <Link href="/rental-terms/" aria-current={current(pathname, "/rental-terms/") ? "page" : undefined} onClick={close}>
              Terms and Conditions
            </Link>
          </li>
          <li>
            <Link href="/faq/" aria-current={current(pathname, "/faq/") ? "page" : undefined} onClick={close}>
              Frequently Asked Questions
            </Link>
          </li>
          <li>
            <Link href="/blog/" aria-current={current(pathname, "/blog/") || current(pathname, "/post/") ? "page" : undefined} onClick={close}>
              Blog
            </Link>
          </li>
          <li>
            <a className="icon-link" href={FACEBOOK} aria-label="Facebook" target="_blank" rel="noreferrer">
              <img src={FACEBOOK_ICON} alt="" width={20} height={20} />
            </a>
          </li>
          <li>
            <Link className="cart-link" href="/cart-page/" aria-label="Cart, 0 items" onClick={close}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M6 6h15l-1.5 9h-12z" />
                <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M6 6 5 3H2" />
                <circle cx="9" cy="20" r="1.3" fill="currentColor" />
                <circle cx="18" cy="20" r="1.3" fill="currentColor" />
              </svg>
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
