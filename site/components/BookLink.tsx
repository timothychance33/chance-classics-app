"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

/** iOS ignores in-page #book links when the page uses smooth scrolling and jumps to the top. */
export function scrollToBookForm() {
  const form = document.getElementById("book");
  if (!(form instanceof HTMLElement)) return false;
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  form.scrollIntoView({ block: "start", inline: "nearest" });
  root.getClientRects();
  root.style.scrollBehavior = previous;
  form.focus({ preventScroll: true });
  return true;
}

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function BookLink({ href, className, children }: Props) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }
    const target = new URL(href, window.location.href);
    const samePage = target.pathname.replace(/\/$/, "") === window.location.pathname.replace(/\/$/, "") && target.hash === "#book";
    if (!samePage || !document.getElementById("book")) return;
    event.preventDefault();
    const next = `${window.location.pathname}${window.location.search}#book`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      history.pushState(null, "", next);
    }
    scrollToBookForm();
  }

  if (href.startsWith("#")) {
    return (
      <a className={className} href={href} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
