"use client";

/**
 * Menu de los modulos en pantalla angosta.
 *
 * Es cliente por una sola razon: un `<details>` no se cierra solo. El layout no
 * se remonta al navegar, asi que el panel abierto sobrevivia al cambio de ruta y
 * la asesora llegaba al Copilot con el menu tapandole el titulo, la ficha y el
 * primer campo. Se cierra cuando cambia la ruta.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { ThemeToggle } from "../../app/(app)/theme-toggle.tsx";
import type { Theme } from "../../lib/theme.ts";
import { AppNavigation } from "./app-navigation.tsx";
import type { NavigationRole } from "./nav-items.ts";

export function MobileNavigation({ role, theme }: { role: NavigationRole; theme: Theme }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  /*
   * `pathname` no se lee dentro del efecto: es el disparador. Quitarlo —que es
   * lo que pide la regla— deja el efecto corriendo una sola vez y el menu
   * vuelve a quedarse abierto al navegar, que es el bug que este componente
   * existe para arreglar.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname es el disparador
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <details className="group relative md:hidden" ref={menu}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card border border-border-control bg-surface px-3 font-medium text-fg marker:hidden">
        <span aria-hidden="true" className="text-lg leading-none">
          ≡
        </span>
        Menú
      </summary>
      <div className="mobile-navigation-panel absolute left-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-2">
        <AppNavigation label="Navegación móvil" role={role} />
        <div className="mt-2 border-t border-border pt-2">
          <ThemeToggle className="flex items-center gap-0.5" initialTheme={theme} />
        </div>
      </div>
    </details>
  );
}
