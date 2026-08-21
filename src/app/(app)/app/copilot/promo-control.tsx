"use client";

/**
 * Precio especial del live, para el producto seleccionado.
 *
 * Vive aqui y no en la ficha del Knowledge Hub porque el descuento es del
 * momento: se prende para este live, aplica solo a esta sesion, y no sobrevive
 * al live por descuido de nadie. La ficha guarda el precio de lista.
 *
 * Muestra el precio final ya calculado —con la misma funcion que alimenta al
 * Copilot— porque un porcentaje mal puesto tiene que notarse aqui y no cuando
 * la asesora ya lo dijo en camara.
 */

import { useState, useTransition } from "react";

import { DEFAULT_PROMO_PERCENT, formatCop, resolvePricing } from "../../../../lib/pricing.ts";
import { setSessionPromoAction } from "./actions.ts";

export function PromoControl({
  sessionId,
  productId,
  priceCop,
  initialPercent,
}: {
  sessionId: string | null;
  productId: string;
  priceCop: number | null;
  initialPercent: number | null;
}) {
  const [active, setActive] = useState(initialPercent !== null);
  // Arranca en el descuento tipico de un live para que prender el check sea un
  // solo clic. Se cambia con las flechas o escribiendo encima.
  const [percentText, setPercentText] = useState(String(initialPercent ?? DEFAULT_PROMO_PERCENT));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const percent = Number(percentText) || null;
  const pricing = resolvePricing({ priceCop, promoActive: active, promoPercent: percent });

  function save(nextActive: boolean, nextPercent: number | null) {
    setMessage(null);
    // Un campo vacio con el check prendido no es "apagado": es un descuento a
    // medio escribir. Guardar null ahi lo apagaria a espaldas de la asesora.
    if (nextActive && nextPercent === null) {
      setMessage("Escribe el porcentaje del descuento.");
      return;
    }
    // Sin live en curso no hay donde guardarlo: la sesion nace con la primera
    // respuesta, y hasta entonces el control solo previsualiza.
    if (!sessionId) return;
    startTransition(async () => {
      const result = await setSessionPromoAction({
        sessionId,
        productId,
        percent: nextActive ? nextPercent : null,
      });
      if (!result.ok) setMessage(result.error.message);
    });
  }

  if (!productId) return null;

  return (
    <fieldset className="mt-4 rounded-card border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-fg">Precio especial del live</legend>

      {priceCop === null ? (
        <p className="text-sm text-fg-muted">
          Esta ficha no tiene precio de lista. Cárgalo en el Knowledge Hub para poder aplicar un
          descuento.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-fg">
              <input
                checked={active}
                className="size-5 rounded border border-control"
                disabled={pending}
                onChange={(event) => {
                  setActive(event.target.checked);
                  save(event.target.checked, percent);
                }}
                type="checkbox"
              />
              Activo
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-fg">
              Descuento
              <input
                className="min-h-11 w-20 rounded-card border border-control bg-surface px-3 tabular-nums"
                disabled={!active || pending}
                max={99}
                min={1}
                onBlur={() => save(active, percent)}
                onChange={(event) => setPercentText(event.target.value)}
                step={1}
                type="number"
                value={percentText}
              />
              <span aria-hidden="true" className="text-fg-muted">
                %
              </span>
            </label>
          </div>

          <p className="mt-3 text-sm tabular-nums" role="status">
            {pricing.promoPriceCop === null ? (
              <>
                El Copilot dirá <strong>{formatCop(pricing.priceCop)}</strong>.
              </>
            ) : (
              <>
                El Copilot dirá <strong>{formatCop(pricing.promoPriceCop)}</strong>{" "}
                <span className="text-fg-muted">
                  (antes {formatCop(pricing.priceCop)}, −{pricing.promoPercent}%)
                </span>
              </>
            )}
          </p>

          {!sessionId ? (
            <p className="mt-2 text-xs text-fg-muted">
              Se guardará cuando arranque el live con la primera respuesta.
            </p>
          ) : null}
          {message ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {message}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
