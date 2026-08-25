import type { ProductRecord } from "../../../../server/products.ts";
import { ClaimList } from "./claim-list.tsx";
import { CollapsibleSection } from "./collapsible-section.tsx";

/**
 * La ficha completa para estudiarla, en secciones plegables.
 *
 * Es de solo lectura a proposito: el Hub es de la administradora y esta pantalla
 * es de la asesora. Lo que se ve aqui es exactamente lo que el Copilot puede
 * decir en camara y sobre lo que el simulador va a preguntar.
 */
export function ProductStudy({ product }: { product: ProductRecord }) {
  return (
    <div className="mt-6">
      <CollapsibleSection count={product.benefits.length} open title="Beneficios y su razón">
        <ol className="space-y-3">
          {product.benefits.map((benefit) => (
            <li key={benefit.rank}>
              <p className="flex gap-2">
                <span className="font-semibold text-primary-deep">{benefit.rank}.</span>
                <span className="font-medium">{benefit.claim}</span>
              </p>
              <p className="mt-1 pl-5 text-fg-muted">{benefit.science_note}</p>
              <p className="mt-1 pl-5 text-xs uppercase tracking-wide text-fg-muted">
                Evidencia {benefit.evidence_level}
              </p>
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {product.activeIngredients.length > 0 ? (
        <CollapsibleSection count={product.activeIngredients.length} open title="Ingredientes">
          <ul className="space-y-1">
            {product.activeIngredients.map((ingredient) => (
              <li className="flex flex-wrap items-baseline gap-2" key={ingredient.name}>
                <span>{ingredient.name}</span>
                {ingredient.amount_per_serving ? (
                  <span className="tabular-nums text-fg-muted">
                    {ingredient.amount_per_serving} {ingredient.unit ?? ""}
                  </span>
                ) : null}
                {ingredient.verified ? null : (
                  <span className="rounded-full border border-warning-border bg-confidence-mid-bg px-2 text-xs font-semibold text-confidence-mid-fg">
                    sin verificar
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {product.faqs.length > 0 ? (
        <CollapsibleSection count={product.faqs.length} title="Preguntas frecuentes">
          <dl className="space-y-3">
            {product.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-medium">{faq.question}</dt>
                <dd className="text-fg-muted">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleSection>
      ) : null}

      {product.objections.length > 0 ? (
        <CollapsibleSection
          count={product.objections.length}
          title="Objeciones y cómo responderlas"
        >
          <dl className="space-y-3">
            {product.objections.map((item) => (
              <div key={item.objection}>
                <dt className="font-medium">{item.objection}</dt>
                <dd className="text-fg-muted">{item.response}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleSection>
      ) : null}

      {product.differentiators.length > 0 ? (
        <CollapsibleSection count={product.differentiators.length} open title="Por qué creerte">
          <dl className="space-y-3">
            {product.differentiators.map((item) => (
              <div key={item.claim}>
                <dt className="font-medium">{item.claim}</dt>
                <dd className="text-fg-muted">{item.evidence}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Qué se puede decir y qué no">
        {product.claimsAllowed.length > 0 ? (
          <div>
            <p className="font-medium text-confidence-high-fg">Se puede afirmar</p>
            <ClaimList items={product.claimsAllowed} />
          </div>
        ) : null}
        {product.claimsCaution.length > 0 ? (
          <div className="mt-3">
            <p className="font-medium text-confidence-mid-fg">Solo con cautela</p>
            <ClaimList items={product.claimsCaution} />
          </div>
        ) : null}
        {product.claimsForbidden.length > 0 ? (
          <div className="mt-3">
            <p className="font-medium text-confidence-low-fg">Nunca se dice</p>
            <ClaimList items={product.claimsForbidden} />
          </div>
        ) : null}
      </CollapsibleSection>

      {product.precautions ? (
        <CollapsibleSection title="Precauciones">
          <p>{product.precautions}</p>
        </CollapsibleSection>
      ) : null}

      {product.sources.length > 0 ? (
        <CollapsibleSection count={product.sources.length} title="Fuentes">
          <ul className="space-y-1">
            {product.sources.map((source, index) => (
              // La clave es la URL y no la etiqueta: dos paginas del mismo sitio
              // comparten etiqueta, y React las trataria como una sola fila.
              <li key={source.url ?? `${index}-${source.label}`}>
                {source.url ? (
                  <a
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={source.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {source.label}
                  </a>
                ) : (
                  <span className="font-medium">{source.label}</span>
                )}
                {source.note ? <p className="text-fg-muted">{source.note}</p> : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
