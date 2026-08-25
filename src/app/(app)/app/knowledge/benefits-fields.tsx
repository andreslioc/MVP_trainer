import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { FormSection } from "./form-section.tsx";
import type { ProductFormValues } from "./product-form-model.ts";

export function BenefitsFields({
  register,
  errors,
}: {
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  return (
    <FormSection
      badge="Obligatorios"
      invalid={Boolean(errors.benefits)}
      title="Tres beneficios priorizados"
    >
      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <fieldset className="rounded-card bg-background p-4" key={index}>
            <legend className="px-1 text-sm font-semibold text-primary-deep">
              Prioridad {index + 1}
            </legend>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-fg">
                Beneficio
                <input
                  className="mt-1 w-full rounded-card border bg-surface px-3 py-2"
                  {...register(`benefits.${index}.claim`)}
                />
                {errors.benefits?.[index]?.claim ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {errors.benefits[index]?.claim?.message}
                  </span>
                ) : null}
              </label>
              <label className="text-sm font-medium text-fg">
                Nivel de evidencia
                <select
                  className="mt-1 w-full rounded-card border bg-surface px-3 py-2"
                  {...register(`benefits.${index}.evidence_level`)}
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-fg">
              Nota científica o fundamento
              <textarea
                className="mt-1 min-h-24 w-full rounded-card border bg-surface px-3 py-2"
                {...register(`benefits.${index}.science_note`)}
              />
              {errors.benefits?.[index]?.science_note ? (
                <span className="mt-1 block text-sm text-destructive">
                  {errors.benefits[index]?.science_note?.message}
                </span>
              ) : null}
            </label>
          </fieldset>
        ))}
      </div>
    </FormSection>
  );
}
