import type { UseFormRegister } from "react-hook-form";

import { COPILOT_VIEW_DEFAULTS } from "../../../../lib/copilot/view-defaults.ts";

/**
 * Duracion de la respuesta. Las etiquetas salen de `view-defaults.ts`, que es
 * donde vive la decision de producto de que Express sea la vista por defecto.
 */
export function DurationChoice({
  register,
}: {
  register: UseFormRegister<{ lengthVariant: "express" | "estandar" | "profunda" }>;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold text-fg">Duración</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(
          [
            ["express", "Express", COPILOT_VIEW_DEFAULTS.durationLabels.express],
            ["estandar", "Estándar", COPILOT_VIEW_DEFAULTS.durationLabels.estandar],
            ["profunda", "Profunda", COPILOT_VIEW_DEFAULTS.durationLabels.profunda],
          ] as const
        ).map(([value, label, duration]) => (
          <label
            // px-1 en movil: a 320 px la tarjeta mide 77 px y "Profunda" ocupa
            // 66, asi que con 8 px de padding a cada lado el texto se salia por
            // el borde. Desde sm sobra espacio y vuelve el aire.
            className="rounded-card border border-border-control px-1 py-2 text-center text-sm sm:px-2"
            key={value}
          >
            <input className="mr-1" type="radio" value={value} {...register("lengthVariant")} />
            <span className="font-semibold">{label}</span>
            <span className="block text-xs text-fg-muted">{duration}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
