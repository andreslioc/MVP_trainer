import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useWatch } from "react-hook-form";

import {
  CLAIM_MAX_WORDS,
  CLAIM_TARGET_WORDS,
  countWords,
} from "../../../../lib/camera-register.ts";
import { FormSection } from "./form-section.tsx";
import type { ProductFormValues } from "./product-form-model.ts";

/**
 * Contador de la frase que se dice en camara.
 *
 * Existe porque el limite no se siente al escribir: doce palabras es lo que
 * cabe en una frase dicha al aire, y sin el contador el campo se llena de
 * subordinadas hasta que la validacion lo rechaza al guardar.
 */
function ClaimCounter({ control, index }: { control: Control<ProductFormValues>; index: number }) {
  const value = useWatch({ control, name: `benefits.${index}.claim` }) ?? "";
  const words = countWords(value);
  if (words === 0) return null;
  const tone =
    words > CLAIM_MAX_WORDS
      ? "text-destructive"
      : words > CLAIM_TARGET_WORDS
        ? "text-confidence-mid-fg"
        : "text-fg-muted";
  return (
    <span className={`mt-1 block text-xs font-normal ${tone}`}>
      {words} {words === 1 ? "palabra" : "palabras"} · objetivo {CLAIM_TARGET_WORDS}, máximo{" "}
      {CLAIM_MAX_WORDS}
    </span>
  );
}

export function BenefitsFields({
  control,
  register,
  errors,
}: {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  return (
    <FormSection
      badge="Obligatorios"
      invalid={Boolean(errors.benefits)}
      title="Tres beneficios priorizados"
    >
      <p className="mb-4 text-sm text-fg-muted">
        Tres registros del mismo dato: lo que se dice al aire, el porqué en palabras de la clienta,
        y el respaldo técnico que nunca se lee en cámara.
      </p>
      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <fieldset className="rounded-card bg-background p-4" key={index}>
            <legend className="px-1 text-sm font-semibold text-primary-deep">
              Prioridad {index + 1}
            </legend>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-fg">
                Lo que dices en cámara
                <input
                  className="mt-1 w-full rounded-card border bg-surface px-3 py-2"
                  {...register(`benefits.${index}.claim`)}
                />
                <ClaimCounter control={control} index={index} />
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
              Por qué es cierto — en palabras de la clienta
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
            <label className="mt-4 block text-sm font-medium text-fg">
              Respaldo técnico — no se dice al aire
              <span className="block text-xs font-normal text-fg-muted">
                Estudios, PMID y nombres científicos. Es lo que sostiene la frase si una clienta
                aprieta.
              </span>
              <textarea
                className="mt-1 min-h-20 w-full rounded-card border bg-surface px-3 py-2"
                {...register(`benefits.${index}.technical_note`)}
              />
            </label>
          </fieldset>
        ))}
      </div>
    </FormSection>
  );
}
