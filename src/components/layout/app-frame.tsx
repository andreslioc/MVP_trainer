"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AppNavigation } from "./app-navigation.tsx";
import { BrandLogo } from "./brand-logo.tsx";
import type { NavigationRole } from "./nav-items.ts";

const SIDEBAR_STORAGE_KEY = "galleon-sidebar-collapsed";

/** Armazon de escritorio: conserva la barra a la vista y recuerda su ancho. */
export function AppFrame({ children, role }: { children: ReactNode; role: NavigationRole }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div
      className={`min-h-screen md:grid md:transition-[grid-template-columns] md:duration-200 motion-reduce:transition-none ${
        collapsed ? "md:grid-cols-[5rem_minmax(0,1fr)]" : "md:grid-cols-[16rem_minmax(0,1fr)]"
      }`}
    >
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <aside
        className={`hidden border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto ${
          collapsed ? "p-2" : "p-4"
        }`}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div
          className={`flex shrink-0 items-center py-3 ${
            collapsed ? "flex-col gap-3" : "justify-between gap-2 px-2"
          }`}
        >
          {collapsed ? (
            <BrandLogo className="h-8 w-auto" priority shape="isotipo" />
          ) : (
            <BrandLogo className="h-auto w-36" priority />
          )}
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menú lateral" : "Minimizar menú lateral"}
            className="flex size-10 shrink-0 items-center justify-center rounded-card border border-border-control bg-surface text-lg font-semibold text-fg-muted hover:border-primary hover:text-fg"
            onClick={toggleSidebar}
            title={collapsed ? "Expandir menú" : "Minimizar menú"}
            type="button"
          >
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          </button>
        </div>
        <div className="mt-4 flex-1">
          <AppNavigation collapsed={collapsed} label="Navegación principal" role={role} />
        </div>
        {collapsed ? null : (
          <p className="border-t border-border px-2 pt-4 text-xs text-fg-muted">
            Training · Copilot · Intelligence
          </p>
        )}
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
