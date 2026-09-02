import { type AdvisorRole, ROLE_LABELS } from "../../lib/roles.ts";
import { logout } from "../logout/actions.ts";

function initialsOf(displayName: string) {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function SessionMenu({ advisor }: { advisor: { displayName: string; role: AdvisorRole } }) {
  const isAdmin = advisor.role === "admin";

  return (
    <div className="flex min-w-0 items-center gap-3">
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
