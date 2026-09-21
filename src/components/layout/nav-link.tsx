"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "./nav-items.ts";

export function NavLink({ item, collapsed = false }: { item: NavItem; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-12 items-center rounded-card border py-2 text-sm ${
        collapsed ? "justify-center px-2" : "gap-3 px-3"
      } ${
        active
          ? "border-primary-deep bg-primary-deep text-primary-fg"
          : "border-transparent text-fg-muted hover:border-border hover:bg-background hover:text-fg"
      }`}
      href={item.href}
      title={collapsed ? `${item.label}: ${item.description}` : undefined}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          active ? "bg-surface text-primary-deep" : "bg-border text-fg"
        }`}
      >
        {item.glyph}
      </span>
      <span className={collapsed ? "sr-only" : "min-w-0"}>
        <span className="block font-semibold">{item.label}</span>
        <span className={`block truncate text-xs ${active ? "text-primary-fg" : "text-fg-muted"}`}>
          {item.description}
        </span>
      </span>
    </Link>
  );
}
