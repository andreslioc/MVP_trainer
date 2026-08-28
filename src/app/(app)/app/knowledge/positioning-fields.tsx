import {
  type Control,
  type FieldErrors,
  useFieldArray,
  type UseFormRegister,
} from "react-hook-form";

import { FormSection } from "./form-section.tsx";
import type { ProductFormValues } from "./product-form-model.ts";

const inputClass = "mt-1 w-full rounded-card border border-border-control bg-surface px-3 py-2";

/**
 * Lo que la etiqueta no dice.
 *
 * La descripcion responde QUE ES; estos campos responden las preguntas que una
 * clienta hace de verdad —para que me sirve, es para mi, en que se diferencia
 * del otro— y que antes se amontonaban en un solo parrafo donde ni el Copilot
 * ni la asesora podian encontrarlas.
 */
export function PositioningFields({
  control,
  register,
  errors,
}: {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  const comparisons = useFieldArray({ control, name: "vsSimilares" });

  return (
    <FormSection
      hint="La descripción dice qué es. Esto dice para qué sirve, para quién y en qué se diferencia."
      title="Posicionamiento y venta"
    >
      <div className="grid gap-4">
        <label className="text-sm font-medium text-fg">
          Para qué sirve
          <textarea className={`${inputClass} min-h-24`} {...register("purpose")} />
          <span className="mt-1 block text-xs font-normal text-fg-muted">
            Dos o tres frases en palabras de la clienta: qué hace por quien lo compra. Qué trae va
            en la descripción y cómo se toma va en modo de uso — aquí no.
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-fg">
            Para quién es
            <textarea className={`${inputClass} min-h-20`} {...register("audience")} />
            <span className="mt-1 block text-xs font-normal text-fg-muted">
              Adultos, deportistas, tipo de piel, especie. Y para quién no.
            </span>
          </label>
          <label className="text-sm font-medium text-fg">
            Subcategoría
            <input className={inputClass} {...register("subcategory")} />
            <span className="mt-1 block text-xs font-normal text-fg-muted">
              La categoría del catálogo es muy ancha para encontrar nada dentro.
            </span>
          </label>
        </div>

        <label className="text-sm font-medium text-fg">
          Frases listas para el live
          <textarea className={`${inputClass} min-h-24`} {...register("liveReadyText")} />
          <span className="mt-1 block text-xs font-normal text-fg-muted">
            Una por línea, máximo seis. Se dicen tal cual, sin jerga técnica: son lo primero que
            toma el Copilot para la respuesta Express.
          </span>
          {errors.liveReadyText ? (
            <span className="mt-1 block text-sm text-destructive">
              {errors.liveReadyText.message}
            </span>
          ) : null}
        </label>

        <label className="text-sm font-medium text-fg">
          Cómo lo busca la gente
          <textarea className={`${inputClass} min-h-20`} {...register("keywordsText")} />
          <span className="mt-1 block text-xs font-normal text-fg-muted">
            Una por línea, con las faltas de ortografía que de verdad se escriben: «aceite oregano»,
            «gotero oregano», «carvacrol».
          </span>
        </label>

        <fieldset className="rounded-card bg-background p-4">
          <legend className="px-1 text-sm font-semibold text-primary-deep">
            Frente a otras presentaciones
          </legend>
          <p className="text-xs text-fg-muted">
            «¿Cuál es la diferencia con el otro?» se responde desde esta ficha, nunca leyendo la
            ficha ajena.
          </p>
          <div className="mt-3 space-y-3">
            {comparisons.fields.map((field, index) => (
              <div className="grid gap-3 md:grid-cols-2" key={field.id}>
                <label className="text-sm font-medium text-fg">
                  Referencia
                  <input className={inputClass} {...register(`vsSimilares.${index}.reference`)} />
                </label>
                <label className="text-sm font-medium text-fg">
                  En qué se diferencia
                  <input className={inputClass} {...register(`vsSimilares.${index}.difference`)} />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-card border border-border-control px-4 text-sm font-semibold text-primary-deep"
              onClick={() => comparisons.append({ reference: "", difference: "" })}
              type="button"
            >
              Agregar comparación
            </button>
            {comparisons.fields.length > 0 ? (
              <button
                className="min-h-11 rounded-card border border-border-control px-4 text-sm font-semibold text-fg"
                onClick={() => comparisons.remove(comparisons.fields.length - 1)}
                type="button"
              >
                Quitar la última
              </button>
            ) : null}
          </div>
        </fieldset>

        <label className="text-sm font-medium text-fg">
          Datos sin confirmar
          <textarea className={`${inputClass} min-h-20`} {...register("verificationGapsText")} />
          <span className="mt-1 block text-xs font-normal text-fg-muted">
            Uno por línea. Lo que la investigación no pudo verificar: es lo que la revisión humana
            tiene que mirar antes de dar la ficha por buena.
          </span>
        </label>
      </div>
    </FormSection>
  );
}
