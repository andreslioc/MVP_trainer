import type { FieldErrors, UseFormRegister, UseFormWatch } from "react-hook-form";

import { formatCop } from "../../../../lib/pricing.ts";
import type { ProductFormValues } from "./product-form-model.ts";

const inputClass = "mt-1 w-full rounded-card border border-control bg-surface px-3 py-2";

/**
 * Precio de lista de la ficha.
 *
 * El precio especial NO vive aqui: se prende en la pantalla del Copilot, sobre
 * la sesion de live. La ficha guarda lo durable —cuanto vale el producto— y el
 * descuento es del momento, se enciende para un live y muere con el.
 */
export function PriceFields({
  register,
  errors,
  watch,
}: {
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  watch: UseFormWatch<ProductFormValues>;
}) {
  const priceCop = Number(watch("priceCopText")) || null;

  return (
    <section aria-labelledby="price-title" className="rounded-card border border-border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-fg" id="price-title">
          Precio de lista
        </h2>
        <span className="text-xs font-medium text-fg-muted">Obligatorio para verificar</span>
      </div>

      <label className="mt-4 block max-w-xs text-sm font-medium text-fg">
        Precio en pesos
        <input
          className={`${inputClass} tabular-nums`}
          inputMode="numeric"
          placeholder="189000"
          {...register("priceCopText")}
        />
        {errors.priceCopText ? (
          <span className="mt-1 block text-sm text-destructive">{errors.priceCopText.message}</span>
        ) : null}
      </label>

      <p className="mt-4 rounded-card bg-background p-3 text-sm tabular-nums" role="status">
        {priceCop === null ? (
          <span className="text-fg-muted">Carga el precio para poder verificar la ficha.</span>
        ) : (
          <>
            El Copilot dirá <strong>{formatCop(priceCop)}</strong>, salvo que actives un precio
            especial durante el live.
          </>
        )}
      </p>
    </section>
  );
}
