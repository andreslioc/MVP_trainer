import { redirect } from "next/navigation";

import { requireRole } from "../../../../lib/auth.ts";
import { listAdvisors } from "../../../../server/advisors.ts";
import { AdvisorDirectory } from "./advisor-directory.tsx";

/**
 * Personas y accesos. Solo administracion.
 *
 * Vivia dentro de Reglas, y se separo cuando entro el rango de supervisora:
 * ella necesita las reglas comerciales para hacer su trabajo, y no cambiar
 * quien entra ni con que rango. Mezclados en una pantalla, darle acceso a lo
 * primero le daba lo segundo.
 */
export default async function AccountsPage() {
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app");

  const advisorsResult = await listAdvisors({ authorize: async () => authorization });

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Administración</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Cuentas
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Quién entra, con qué rango y quién está activa. Asesoría ve los cinco módulos de trabajo;
        supervisión suma el Knowledge Hub y las reglas comerciales; administración suma esta
        pantalla y las analíticas.
      </p>

      <AdvisorDirectory result={advisorsResult} />
    </section>
  );
}
