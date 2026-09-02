import type { ProductRecord } from "../../../../server/products.ts";
import { ClaimList } from "./claim-list.tsx";
import { CollapsibleSection } from "./collapsible-section.tsx";
import { FullAnswerPanel } from "./full-answer-panel.tsx";

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
      {/*
        La Respuesta Completa va primero y abierta; el resumen, plegado debajo.
        El orden es la enseñanza: lo primero que la asesora tiene que oir es
        como suena el producto explicado bien, no una lista de lo que debe
        recordar. El resumen es repaso, y el repaso viene despues.
      */}
      {product.fullAnswer ? <FullAnswerPanel fullAnswer={product.fullAnswer} /> : null}

      {product.advisorSummary ? (
        <CollapsibleSection title="Lo que tienes que recordar">
          <p className="text-fg">{product.advisorSummary}</p>
        </CollapsibleSection>
      ) : null}

      {product.liveReady.length > 0 ? (
        <CollapsibleSection count={product.liveReady.length} open title="Frases listas para decir">
          <ul className="space-y-2">
            {product.liveReady.map((line) => (
              <li className="flex gap-2 text-fg" key={line}>
                <span aria-hidden="true" className="text-confidence-high-fg">
                  ·
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {product.cautionGuidance.length > 0 ? (
        <CollapsibleSection count={product.cautionGuidance.length} title="Se puede decir, pero así">
          <ul className="space-y-3">
            {product.cautionGuidance.map((item) => (
              <li key={item.claim}>
                <p className="font-medium text-fg">{item.claim}</p>
                <p className="mt-1 text-sm text-fg-muted">{item.reason}</p>
                <p className="mt-1 rounded-card border border-warning-border bg-confidence-mid-bg px-3 py-2 text-sm text-confidence-mid-fg">
                  Dilo así: {item.safe_form}
                </p>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {product.avoidGuidance.length > 0 ? (
        <CollapsibleSection count={product.avoidGuidance.length} title="Esto no se dice">
          <ul className="space-y-3">
            {product.avoidGuidance.map((item) => (
              <li key={item.avoid}>
                <p className="font-medium text-confidence-low-fg">{item.avoid}</p>
                <p className="mt-1 text-sm text-fg-muted">{item.reason}</p>
                {item.alternative ? (
                  <p className="mt-1 rounded-card border border-success bg-confidence-high-bg px-3 py-2 text-sm text-confidence-high-fg">
                    En su lugar: {item.alternative}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

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
              {/* Plegado y no a la vista: es lo que sostiene la frase cuando una
                  clienta aprieta, no lo que se lee al aire. */}
              {benefit.technical_note ? (
                <details className="mt-1 pl-5">
                  <summary className="cursor-pointer text-xs font-semibold text-primary-deep">
                    Respaldo técnico
                  </summary>
                  <p className="mt-1 text-sm text-fg-muted">{benefit.technical_note}</p>
                </details>
              ) : null}
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

      <CollapsibleSection title="Qué decir y qué no decir">
        {product.claimsAllowed.length > 0 ? (
          <div>
            <p className="font-medium text-confidence-high-fg">Puedes decirlo tal cual</p>
            <ClaimList items={product.claimsAllowed} />
          </div>
        ) : null}
        {product.claimsCaution.length > 0 ? (
          <div className="mt-3">
            <p className="font-medium text-confidence-mid-fg">Cuidado al decir esto</p>
            <ClaimList items={product.claimsCaution} />
          </div>
        ) : null}
        {product.claimsForbidden.length > 0 ? (
          <div className="mt-3">
            <p className="font-medium text-confidence-low-fg">Esto nunca se dice</p>
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
