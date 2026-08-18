import Link from "next/link";

import { getSession } from "../../../../lib/auth.ts";
import { listProducts } from "../../../../server/products.ts";

export default async function KnowledgePage() {
  const session = await getSession();
  if (!session.ok) return null;
  const result = await listProducts({ authorize: async () => session });

  return (
    <section aria-labelledby="page-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Fuente de verdad</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
            Knowledge Hub
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Información verificada para entrenar y responder durante un live sin improvisar.
          </p>
        </div>
        {session.data.role === "admin" ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep"
            href="/app/knowledge/new"
          >
            Nueva ficha
          </Link>
        ) : null}
      </div>

      {!result.ok ? (
        <div className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4">
          <p className="font-semibold text-confidence-low-fg">No se pudieron cargar las fichas.</p>
          <Link
            className="mt-2 inline-block font-semibold text-primary underline"
            href="/app/knowledge"
          >
            Reintentar
          </Link>
        </div>
      ) : result.data.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-semibold text-fg">El conocimiento empieza aquí</h2>
          <p className="mt-2 max-w-xl text-fg-muted">
            Aún no hay fichas. Crea la primera para que el Simulator y el Copilot tengan de donde
            leer.
          </p>
          {session.data.role === "admin" ? (
            <Link
              className="mt-4 inline-flex min-h-11 items-center rounded-card border border-border-control px-4 font-semibold text-primary-deep"
              href="/app/knowledge/new"
            >
              Crear la primera ficha
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {result.data.map((product) => (
            <article
              aria-labelledby={`product-${product.id}`}
              className="flex flex-col rounded-card border border-border bg-surface p-4"
              key={product.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {product.brand} · {product.category}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-fg" id={`product-${product.id}`}>
                    {product.name}
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    {product.presentation} · {product.format}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${
                    product.verifiedAt
                      ? "border-success bg-confidence-high-bg text-confidence-high-fg"
                      : "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg"
                  }`}
                >
                  {product.verifiedAt ? "Verificada" : "Por verificar"}
                </span>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-fg">
                {product.benefits.map((benefit) => (
                  <li className="flex gap-2" key={benefit.rank}>
                    <span className="font-semibold text-primary-deep">{benefit.rank}.</span>
                    <span>{benefit.claim}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-auto pt-5">
                {session.data.role === "admin" ? (
                  <Link
                    className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
                    href={`/app/knowledge/${product.id}`}
                  >
                    Editar ficha
                  </Link>
                ) : (
                  <p className="text-sm text-fg-muted">Disponible para consulta del equipo.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
