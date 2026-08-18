import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNavigation } from "../../components/layout/app-navigation.tsx";
import { MobileNavigation } from "../../components/layout/mobile-navigation.tsx";
import { getSession } from "../../lib/auth.ts";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.ok) {
    redirect("/login?next=/app");
  }

  const initials = session.data.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <aside className="hidden border-r border-border bg-surface p-4 md:flex md:flex-col">
        <div className="flex items-center gap-3 px-2 py-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-card bg-primary-deep font-semibold text-primary-fg"
          >
            SS
          </span>
          <span>
            <span className="block text-sm font-semibold text-fg">Super Store</span>
            <span className="block text-xs font-medium text-fg-muted">Sales OS</span>
          </span>
        </div>
        <div className="mt-6 flex-1">
          <AppNavigation label="Navegación principal" role={session.data.role} />
        </div>
        <p className="border-t border-border px-2 pt-4 text-xs text-fg-muted">
          Training · Copilot · Intelligence
        </p>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNavigation role={session.data.role} />
            <div className="min-w-0 md:hidden">
              <p className="truncate text-sm font-semibold text-fg">Super Store</p>
              <p className="truncate text-xs text-fg-muted">Sales OS</p>
            </div>
            <p className="hidden text-sm text-fg-muted md:block">Espacio de trabajo comercial</p>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-fg">{session.data.displayName}</p>
              <p className="text-xs capitalize text-fg-muted">{session.data.role}</p>
            </div>
            <span
              aria-label={`Cuenta de ${session.data.displayName}`}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-control bg-background text-sm font-semibold text-primary-deep"
              role="img"
            >
              {initials}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
