"use client";

/**
 * Editor de listas de dos textos: preguntas frecuentes, objeciones y
 * diferenciadores.
 *
 * Las tres tienen la misma forma —un par de textos que se repite— y antes las
 * tres eran un textarea donde habia que escribir JSON a mano, con corchetes y
 * comillas. Eso le pide a una asesora que aprenda un formato de programador
 * para cargar una ficha, y un JSON mal cerrado tiraba el formulario entero.
 *
 * Un solo componente para las tres, con sus etiquetas propias: la forma es la
 * misma y tres copias se desincronizan a la primera edicion.
 */

import {
  type Control,
  type FieldErrors,
  useFieldArray,
  type UseFormRegister,
} from "react-hook-form";

import { FormSection } from "./form-section.tsx";
import type { ProductFormValues } from "./product-form-model.ts";

type PairName = "faqs" | "objections" | "differentiators";

const FIELDS = {
  faqs: ["question", "answer"],
  objections: ["objection", "response"],
  differentiators: ["claim", "evidence"],
} as const;

const inputClass = "mt-1 w-full rounded-card border border-control bg-surface px-3 py-2";

export function PairListFields({
  name,
  title,
  hint,
  labels,
  placeholders,
  control,
  register,
  errors,
}: {
  name: PairName;
  title: string;
  /** Para que se sepa a que sirve el campo sin tener que preguntarlo. */
  hint: string;
  labels: [string, string];
  placeholders: [string, string];
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const [first, second] = FIELDS[name];
  const rows = errors[name] as Array<Record<string, { message?: string }>> | undefined;

  return (
    <FormSection
      badge={fields.length === 0 ? "Ninguna todavía" : `${fields.length} en la ficha`}
      hint={hint}
      invalid={Boolean(rows)}
      level={3}
      title={title}
    >
      <ul className="space-y-3">
        {fields.map((field, index) => (
          <li className="rounded-card bg-background p-3" key={field.id}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-fg">
                {labels[0]}
                <input
                  className={inputClass}
                  placeholder={placeholders[0]}
                  {...register(`${name}.${index}.${first}` as `faqs.${number}.question`)}
                />
                {rows?.[index]?.[first]?.message ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {rows[index]?.[first]?.message}
                  </span>
                ) : null}
              </label>
              <label className="text-sm font-medium text-fg">
                {labels[1]}
                <input
                  className={inputClass}
                  placeholder={placeholders[1]}
                  {...register(`${name}.${index}.${second}` as `faqs.${number}.answer`)}
                />
                {rows?.[index]?.[second]?.message ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {rows[index]?.[second]?.message}
                  </span>
                ) : null}
              </label>
            </div>
            <button
              className="mt-2 min-h-11 rounded-card px-2 text-sm font-semibold text-destructive"
              onClick={() => remove(index)}
              type="button"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <button
        className="mt-3 min-h-11 rounded-card border border-primary px-3 text-sm font-semibold text-primary"
        onClick={() =>
          append({ [first]: "", [second]: "" } as { question: string; answer: string })
        }
        type="button"
      >
        Agregar
      </button>
    </FormSection>
  );
}
