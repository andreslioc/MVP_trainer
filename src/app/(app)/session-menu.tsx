import { type AdvisorRole, ROLE_LABELS } from "../../lib/roles.ts";
import type { Theme } from "../../lib/theme.ts";
import { logout } from "../logout/actions.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

function initialsOf(displayName: string) {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function SessionMenu({
  advisor,
  theme,
}: {
  advisor: { displayName: string; role: AdvisorRole };
  theme: Theme;
}) {
  const isAdmin = advisor.role === "admin";

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/*
        `md` y no `sm`: hasta 768px el menu movil sigue en pantalla y ahi ya
        aparece el interruptor. Con `sm:flex` se pintaban los dos a la vez entre
        640 y 767px y el header se desbordaba de lado.
      */}
      <ThemeToggle className="hidden md:flex md:items-center md:gap-0.5" initialTheme={theme} />
      <div className="hidden min-w-0 text-right sm:block">
        <p className="truncate text-sm font-semibold text-fg">{advisor.displayName}</p>
        <span
          className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
            isAdmin
              ? "border-primary-tint-border bg-primary-tint text-primary-deep"
              : "border-border bg-background text-fg-muted"
          }`}
        >
          {ROLE_LABELS[advisor.role]}
        </span>
      </div>
      <span
        aria-label={`Cuenta de ${advisor.displayName}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-control bg-background text-sm font-semibold text-primary-deep"
        role="img"
      >
        {initialsOf(advisor.displayName)}
      </span>
      <form action={logout}>
        <button
          className="min-h-11 shrink-0 rounded-card border border-border-control px-3 text-sm font-semibold text-fg hover:bg-background"
          type="submit"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
