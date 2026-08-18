import { AppNavigation } from "./app-navigation.tsx";
import type { NavigationRole } from "./nav-items.ts";

export function MobileNavigation({ role }: { role: NavigationRole }) {
  return (
    <details className="group relative md:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card border border-border-control bg-surface px-3 font-medium text-fg marker:hidden">
        <span aria-hidden="true" className="text-lg leading-none">
          ≡
        </span>
        Menú
      </summary>
      <div className="mobile-navigation-panel absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-2">
        <AppNavigation label="Navegación móvil" role={role} />
      </div>
    </details>
  );
}
