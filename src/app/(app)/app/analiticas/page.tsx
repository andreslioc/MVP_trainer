import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "../../../../lib/auth.ts";
import { listAdvisors } from "../../../../server/advisors.ts";

/**
 * Lista de personas para entrar a las analiticas de una.
 *
 * Solo administracion: el desempeño de una asesora lo mira quien la acompaña,
 * no sus pares.
 */
export default async function AnalyticsIndexPage() {
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app");

  const result = await listAdvisors({ authorize: async () => authorization });

  return (
    <section aria-labelledby="page-title" className="max-w-3xl">
      <p className="text-sm font-semibold text-primary">Administración</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Analíticas
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Elige a quién quieres ver. Cada panel muestra cuánto practicó, qué tan bien le fue y en qué
        dimensión conviene ayudarla.
      </p>

      {!result.ok ? (
        <p
          className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4 text-confidence-low-fg"
          role="alert"
        >
          No se pudieron cargar las personas.
        </p>
      ) : (
        <ul className="mt-8 grid gap-2">
          {result.data.map((advisor) => (
            <li key={advisor.id}>
              <Link
                className="flex items-center justify-between gap-4 rounded-card border border-border-decorative bg-surface p-4 transition-transform duration-120 ease-out hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-deep motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                href={`/app/analiticas/${advisor.id}`}
              >
                <span>
                  <span className="block font-semibold text-fg">{advisor.displayName}</span>
                  <span className="block text-sm text-fg-muted">{advisor.email}</span>
                </span>
                <span className="text-sm text-fg-muted">Ver panel</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
