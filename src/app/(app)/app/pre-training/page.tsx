import Link from "next/link";

import { Card, cardClasses } from "../../../../components/ui/card.tsx";
import { CardGrid } from "../../../../components/ui/card-grid.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { getSession } from "../../../../lib/auth.ts";
import { formatCop } from "../../../../lib/pricing.ts";
import { listProducts } from "../../../../server/products.ts";

/**
 * Pre-training: la asesora estudia la ficha antes de practicarla.
 *
 * Solo fichas verificadas, igual que el Training y el Copilot: estudiar un
 * borrador seria aprenderse un dato que manana cambia.
 */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export default async function PreTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session.ok) return null;
  const { categoria, q } = await searchParams;
  const result = await listProducts({ authorize: async () => session });

  if (!result.ok) {
    return (
      <PageSection title="Pre-training" width="panel">
        <Card className="mt-8" density="compacta" tone="alerta">
          <p className="font-semibold" role="alert">
            No se pudieron cargar las fichas.
          </p>
          <Link
            className="mt-2 inline-block font-semibold text-primary underline"
            href="/app/pre-training"
          >
            Reintentar
          </Link>
        </Card>
      </PageSection>
    );
  }

  const verified = result.data.filter((product) => product.verifiedAt !== null);
  const categories = [...new Set(verified.map((product) => product.category))].sort();
  const selected = categoria && categories.includes(categoria) ? categoria : null;
  const search = normalize(q ?? "");
  const shown = verified
    .filter((product) => !selected || product.category === selected)
    // Nombre, marca y SKU: la asesora busca "oregano" o "piping", y la bodega
    // busca por SKU. Sin tildes y en minusculas — "orégano" y "oregano" son la
    // misma busqueda para quien escribe rapido entre dos lives.
    .filter(
      (product) =>
        search === "" ||
        normalize(`${product.name} ${product.brand} ${product.sku ?? ""}`).includes(search),
    );

  return (
    <PageSection
      eyebrow="Antes de practicar"
      lead="Estudia la ficha antes del simulacro: qué contiene, cómo se toma, quién no debe tomarlo y qué se puede afirmar en cámara."
      title="Pre-training"
      width="panel"
    >
      {verified.length === 0 ? (
        <Card className="mt-8">
          <h2 className="font-display text-xl font-medium text-fg">
            Todavía no hay fichas verificadas
          </h2>
          <p className="mt-2 max-w-xl text-fg-muted">
            Una administradora debe revisar al menos una ficha para que se pueda estudiar.
          </p>
        </Card>
      ) : (
        <>
          {/* Formulario GET y no un input controlado: la busqueda vive en la URL,
              se puede compartir y recargar, y la pagina sigue siendo un Server
              Component sin un solo kilobyte de JavaScript. */}
          <form action="/app/pre-training" className="mt-6 flex flex-wrap gap-2" method="get">
            {selected ? <input name="categoria" type="hidden" value={selected} /> : null}
            <label className="flex-1 text-sm font-medium text-fg" htmlFor="pre-training-q">
              <span className="sr-only">Buscar producto</span>
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
                defaultValue={q ?? ""}
                id="pre-training-q"
                name="q"
                placeholder="Busca por nombre, marca o SKU"
                type="search"
              />
            </label>
            <button
              className="min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep"
              type="submit"
            >
              Buscar
            </button>
            {search ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-card border border-border-control px-4 font-semibold text-primary-deep"
                href={
                  selected
                    ? `/app/pre-training?categoria=${encodeURIComponent(selected)}`
                    : "/app/pre-training"
                }
              >
                Limpiar
              </Link>
            ) : null}
          </form>

          <nav aria-label="Categorías" className="mt-4 flex flex-wrap gap-2">
            <Link
              className={`min-h-11 rounded-card border px-3 py-2 text-sm font-semibold ${
                selected
                  ? "border-border-control bg-surface text-fg"
                  : "border-primary bg-primary text-primary-fg"
              }`}
              href={
                search ? `/app/pre-training?q=${encodeURIComponent(q ?? "")}` : "/app/pre-training"
              }
            >
              Todas · {verified.length}
            </Link>
            {categories.map((category) => {
              const count = verified.filter((product) => product.category === category).length;
              return (
                <Link
                  className={`min-h-11 rounded-card border px-3 py-2 text-sm font-semibold ${
                    selected === category
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border-control bg-surface text-fg"
                  }`}
                  href={`/app/pre-training?categoria=${encodeURIComponent(category)}${
                    search ? `&q=${encodeURIComponent(q ?? "")}` : ""
                  }`}
                  key={category}
                >
                  {category} · {count}
                </Link>
              );
            })}
          </nav>

          {shown.length === 0 ? (
            <Card className="mt-6" density="compacta">
              <p className="text-fg-muted">
                Ninguna ficha coincide con «{q}»{selected ? ` en ${selected}` : ""}.
              </p>
            </Card>
          ) : null}

          {/* La escalera del sistema y no una propia: antes esta rejilla se
              quedaba en UNA columna hasta 1024 px, asi que en tableta cada
              ficha ocupaba el ancho entero y se veian dos por pantalla. */}
          <CardGrid as="ul" className="mt-6" columns={3}>
            {shown.map((product) => (
              <li key={product.id}>
                <Link
                  className={cardClasses({
                    density: "sin",
                    interactive: true,
                    // `sin` porque la tarjeta trae su propio aire adentro: la
                    // placa de la foto pega al borde y el cuerpo lleva su p-4.
                    className: "flex h-full flex-col overflow-hidden",
                  })}
                  href={`/app/pre-training/${product.id}`}
                >
                  {/* La foto es como la asesora reconoce el producto: el nombre
                      del catalogo es una cadena de sesenta caracteres en ingles.
                      Placa de alto fijo con `contain` porque las fotos vienen en
                      proporciones muy distintas —de 181x536 a 512x640— y sin ella
                      la cuadricula queda a los saltos. */}
                  <div className="flex h-40 items-center justify-center border-b border-photo-border bg-photo p-3">
                    {product.imageUrl ? (
                      // biome-ignore lint/performance/noImgElement: las fuentes remotas tienen dimensiones variables; el elemento nativo conserva su proporcion sin ampliarlas
                      <img
                        alt=""
                        className="max-h-full w-auto max-w-full object-contain"
                        decoding="async"
                        loading="lazy"
                        src={product.imageUrl}
                      />
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        Sin foto
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      {product.brand} · {product.format}
                    </p>
                    <p className="mt-1 font-semibold text-fg">{product.name}</p>
                    <p className="mt-1 text-sm text-fg-muted">{product.presentation}</p>
                    <p className="mt-2 text-lg font-semibold tabular-nums text-fg">
                      {formatCop(product.priceCop) ?? "Sin precio"}
                    </p>
                    {product.usageMode ? (
                      <p className="mt-3 line-clamp-2 text-sm text-fg">
                        <span className="font-semibold">Uso:</span> {product.usageMode}
                      </p>
                    ) : null}
                    {product.contraindications.length > 0 ? (
                      <p className="mt-auto pt-3 text-xs font-medium text-confidence-mid-fg">
                        No lo toman: {product.contraindications.slice(0, 3).join(" · ")}
                        {product.contraindications.length > 3
                          ? ` +${product.contraindications.length - 3}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </CardGrid>
        </>
      )}
    </PageSection>
  );
}
