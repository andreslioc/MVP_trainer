import { Card } from "../../../../components/ui/card.tsx";
import type { ProductKnowledgeProgress } from "../../../../server/product-knowledge.ts";

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

const statusLabel = {
  linea_base: "Construyendo línea base",
  mejoro: "Mejoró",
  estable: "Se mantiene",
  bajo: "Necesita refuerzo",
} as const;

export function ProductKnowledgeCard({ knowledge }: { knowledge: ProductKnowledgeProgress }) {
  if (knowledge.score === null) {
    return (
      <Card density="compacta">
        <p className="text-sm text-fg-muted">Conocimiento de los productos</p>
        <p className="mt-2 font-semibold text-fg">Sin respuestas evaluadas en esta ventana.</p>
      </Card>
    );
  }

  return (
    <Card density="compacta">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-fg-muted">Conocimiento de los productos</p>
          <p className="mt-1 text-4xl font-semibold text-fg">
            {knowledge.score}
            <span className="text-xl font-normal text-fg-muted">/100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Evolución</p>
          <p className="mt-1 font-semibold text-fg">
            {knowledge.delta === null ? "Sin base comparable" : `${signed(knowledge.delta)} puntos`}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-fg-muted">
        Basado en {knowledge.answers} respuestas de {knowledge.products}{" "}
        {knowledge.products === 1 ? "producto" : "productos"}. La evolución compara únicamente los
        productos entrenados en ambos períodos.
      </p>

      <details className="mt-4 border-t border-border pt-4">
        <summary className="min-h-11 cursor-pointer font-semibold text-primary">
          Ver avance por producto
        </summary>
        <ul className="divide-y divide-border">
          {knowledge.items.map((item) => (
            <li
              className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              key={item.productId}
            >
              <div>
                <p className="font-medium text-fg">{item.name}</p>
                <p className="text-xs text-fg-muted">
                  {item.answers}{" "}
                  {item.answers === 1 ? "respuesta evaluada" : "respuestas evaluadas"}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="font-semibold text-fg">{item.score}/100</p>
                <p className="text-xs text-fg-muted">
                  {statusLabel[item.status]}
                  {item.delta === null ? "" : ` · ${signed(item.delta)} puntos`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
