"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "./nav-items.ts";

export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-12 items-center gap-3 rounded-card border px-3 py-2 text-sm ${
        active
          ? "border-primary-deep bg-primary-deep text-primary-fg"
          : "border-transparent text-fg-muted hover:border-border hover:bg-background hover:text-fg"
      }`}
      href={item.href}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          active ? "bg-surface text-primary-deep" : "bg-border text-fg"
        }`}
      >
        {item.glyph}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{item.label}</span>
        <span className={`block truncate text-xs ${active ? "text-primary-fg" : "text-fg-muted"}`}>
          {item.description}
        </span>
      </span>
    </Link>
  );
}
