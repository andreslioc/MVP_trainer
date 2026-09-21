import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppFrame } from "../../components/layout/app-frame.tsx";
import { BrandLogo } from "../../components/layout/brand-logo.tsx";
import { MobileNavigation } from "../../components/layout/mobile-navigation.tsx";
import { getSession } from "../../lib/auth.ts";
import { THEME_COOKIE, parseTheme } from "../../lib/theme.ts";
import { SessionMenu } from "./session-menu.tsx";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.ok) {
    redirect("/login?next=/app");
  }
  // El interruptor arranca marcando lo que ya esta elegido, no lo que supone.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <AppFrame role={session.data.role}>
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNavigation role={session.data.role} theme={theme} />
          {/* En movil solo cabe el isotipo: el escudo se reconoce solo. */}
          <BrandLogo className="h-7 w-auto md:hidden" shape="isotipo" />
          <p className="hidden text-sm text-fg-muted md:block">Espacio de trabajo comercial</p>
        </div>
        <SessionMenu advisor={session.data} theme={theme} />
      </header>

      <main className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8" id="main-content">
        {children}
      </main>
    </AppFrame>
  );
}
