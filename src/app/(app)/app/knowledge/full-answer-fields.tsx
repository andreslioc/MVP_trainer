"use client";

import { type FieldErrors, type UseFormRegister, useWatch } from "react-hook-form";

import { FormSection } from "./form-section.tsx";
import type { ProductFormValues } from "./product-form-model.ts";

const inputClass = "mt-1 w-full rounded-card border border-border-control bg-surface px-3 py-2";

/** Unas 2,8 palabras por segundo hablando en camara, medido sobre las fichas. */
const WORDS_PER_SECOND = 2.8;
/** El campo se define como de 45 a 60 segundos; el validador corta en 190. */
const MAX_WORDS = 190;

const BLOCKS: Array<{
  name: keyof ProductFormValues["fullAnswer"];
  label: string;
  hint: string;
}> = [
  { name: "what_it_is", label: "1. Qué es", hint: "Formato, presentación y de qué está hecho." },
  { name: "what_for", label: "2. Para qué sirve", hint: "Las dos vías, si tiene dos." },
  {
    name: "benefits",
    label: "3. Beneficios",
    hint: "Dos o tres, seguidos, para decirse de corrido.",
  },
  {
    name: "science",
    label: "4. Por qué funciona",
    hint: "En el idioma de la clienta, sin palabras de paper.",
  },
  {
    name: "different",
    label: "5. Qué lo hace distinto",
    hint: "Frente a lo que se le parece, con la cifra.",
  },
  {
    name: "trust",
    label: "6. Por qué confiar",
    hint: "Certificaciones y origen. Aquí sí se nombra la etiqueta.",
  },
  {
    name: "commercial",
    label: "7. Presentación y precio",
    hint: "Cuánto trae, cuánto rinde y cuánto dura.",
  },
  { name: "cta", label: "8. Invitación", hint: "Corta y sin presión." },
  {
    name: "warning",
    label: "9. Advertencia o límite",
    hint: "SOLO si aplica. Vacío si el producto no tiene un límite real.",
  },
];

/**
 * La Respuesta Completa: como suena el producto explicado entero.
 *
 * Nueve cuadros y no uno grande, porque el Copilot y el Simulador eligen
 * bloques segun la pregunta y un parrafo suelto obliga a recortar a ojo —y
 * recortar es donde se pierde la advertencia—.
 *
 * El contador de arriba existe porque la primera version escrita a mano dio 98
 * segundos para un campo definido como de 45 a 60. Un limite que no se ve
 * mientras se escribe no se respeta.
 */
export function FullAnswerFields({
  register,
  errors,
  control,
}: {
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  control: import("react-hook-form").Control<ProductFormValues>;
}) {
  const values = useWatch({ control, name: "fullAnswer" });
  const words = Object.values(values ?? {})
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const seconds = Math.round(words / WORDS_PER_SECOND);
  const tooLong = words > MAX_WORDS;

  return (
    <FormSection
      hint="Cómo sonaría este producto explicado entero, de 45 a 60 segundos. No es un guion para repetir: es la referencia de la que el Copilot toma bloques."
      title="Respuesta modelo completa"
    >
      <p
        className={`mb-4 text-sm tabular-nums ${tooLong ? "text-confidence-low-fg" : "text-fg-muted"}`}
        role={tooLong ? "alert" : undefined}
      >
        {words === 0
          ? "Sin escribir todavía."
          : `${words} palabras · unos ${seconds} s${tooLong ? " — pasa del minuto, recorta" : ""}`}
      </p>
      <div className="space-y-4">
        {BLOCKS.map((block) => (
          <div key={block.name}>
            <label className="block text-sm font-medium text-fg" htmlFor={`fa-${block.name}`}>
              {block.label}
            </label>
            <span className="text-xs text-fg-muted">{block.hint}</span>
            <textarea
              className={inputClass}
              id={`fa-${block.name}`}
              rows={2}
              {...register(`fullAnswer.${block.name}`)}
            />
          </div>
        ))}
      </div>
      {errors.fullAnswer?.root ? (
        <p className="mt-2 text-sm text-confidence-low-fg" role="alert">
          {errors.fullAnswer.root.message}
        </p>
      ) : null}
    </FormSection>
  );
}
