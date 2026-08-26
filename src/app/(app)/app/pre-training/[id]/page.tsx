import Link from "next/link";
import { notFound } from "next/navigation";

import { getSession } from "../../../../../lib/auth.ts";
import { formatCop } from "../../../../../lib/pricing.ts";
import { getProduct } from "../../../../../server/products.ts";
import { ProductStudy } from "../product-study.tsx";

export default async function PreTrainingProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session.ok) return null;
  const result = await getProduct(id, { authorize: async () => session });
  if (!result.ok) notFound();
  // Una ficha en borrador no se estudia: lo que se aprende de ella puede cambiar
  // antes del live, y el simulador tampoco pregunta por ella.
  if (!result.data.verifiedAt) notFound();

  const product = result.data;

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <Link className="text-sm font-semibold text-primary" href="/app/pre-training">
        ← Volver a Pre-training
      </Link>

      {/* Banda de portada en dos columnas: la foto ocupa toda la altura a la
          izquierda y TODO el texto vive a la derecha —identidad arriba, precio y
          descripcion abajo—. Antes el bloque de precio cruzaba el ancho completo
          y partia la banda en dos pisos que no se leian como uno. */}
      <div className="mt-4 flex flex-wrap items-stretch overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex w-full flex-none items-center justify-center border-primary-tint-border bg-primary-tint p-6 sm:w-60 sm:border-r">
          {product.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: las fuentes remotas tienen dimensiones variables; el elemento nativo conserva su proporcion sin ampliarlas
            <img
              alt=""
              className="max-h-56 w-auto max-w-full"
              decoding="async"
              src={product.imageUrl}
            />
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Sin foto
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-primary-tint-border bg-primary-tint px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {product.brand} · {product.category}
            </p>
            <h1
              className="mt-1 text-3xl font-semibold leading-tight tracking-tight text-fg"
              id="page-title"
            >
              {product.name}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              {product.presentation} · {product.format}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-2 px-6 py-4">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-primary-deep">
              {formatCop(product.priceCop) ?? "Sin precio"}
            </p>
            <span className="rounded-full border border-success bg-confidence-high-bg px-3 py-1 text-xs font-semibold text-confidence-high-fg">
              Verificada
            </span>
            {product.description ? (
              <p className="w-full text-sm text-fg-muted">{product.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <ProductStudy product={product} />

        {/* Columna de apoyo: lo que se dice en camara no se abre, se lee. */}
        <aside className="flex flex-col gap-3">
          {product.usageMode ? (
            <div className="rounded-card border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                En cámara
              </p>
              <dl className="mt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Modo de uso</dt>
                  <dd className="text-right font-medium text-fg">{product.usageMode}</dd>
                </div>
                <div className="mt-3 flex justify-between gap-3 border-t border-border pt-3">
                  <dt className="text-fg-muted">Presentación</dt>
                  <dd className="text-right font-medium text-fg">{product.presentation}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {product.contraindications.length > 0 ? (
            <div className="rounded-card border border-warning-border bg-confidence-mid-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-confidence-mid-fg">
                No lo toman
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-confidence-mid-fg">
                {product.contraindications.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep"
            href="/app/training"
          >
            Practicar esta ficha
          </Link>
        </aside>
      </div>
    </section>
  );
}
