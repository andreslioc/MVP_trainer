"use client";

/**
 * Editor de ingredientes activos y de fuentes.
 *
 * Los dos eran textareas de JSON. La cantidad va aparte de la unidad porque el
 * validador exige unidad cuando hay cantidad, y solo permite cantidad cuando el
 * ingrediente esta verificado: separandolos, el error senala el campo exacto en
 * vez de "el JSON esta mal".
 */

import {
  type Control,
  type FieldErrors,
  useFieldArray,
  type UseFormRegister,
} from "react-hook-form";

import type { ProductFormValues } from "./product-form-model.ts";

const inputClass = "mt-1 w-full rounded-card border border-control bg-surface px-3 py-2";

function RowShell({
  title,
  count,
  hint,
  children,
  onAdd,
  id,
}: {
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
  onAdd: () => void;
  id: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-fg" id={`${id}-title`}>
          {title}
        </h3>
        <span className="text-xs text-fg-muted">
          {count === 0 ? "Ninguno todavía" : `${count} en la ficha`}
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{hint}</p>
      <ul className="mt-3 space-y-3">{children}</ul>
      <button
        className="mt-3 min-h-11 rounded-card border border-primary px-3 text-sm font-semibold text-primary"
        onClick={onAdd}
        type="button"
      >
        Agregar
      </button>
    </section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mt-2 min-h-11 rounded-card px-2 text-sm font-semibold text-destructive"
      onClick={onClick}
      type="button"
    >
      Quitar
    </button>
  );
}

export function IngredientFields({
  control,
  register,
  errors,
}: {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "activeIngredients" });

  return (
    <RowShell
      count={fields.length}
      hint="Lo que trae el producto. La cantidad solo se registra si el ingrediente está verificado, y siempre con su unidad."
      id="ingredientes"
      onAdd={() => append({ name: "", amountText: "", unit: "", verified: false })}
      title="Ingredientes activos"
    >
      {fields.map((field, index) => (
        <li className="rounded-card bg-background p-3" key={field.id}>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm font-medium text-fg sm:col-span-2">
              Ingrediente
              <input
                className={inputClass}
                placeholder="Magnesio"
                {...register(`activeIngredients.${index}.name`)}
              />
              {errors.activeIngredients?.[index]?.name ? (
                <span className="mt-1 block text-sm text-destructive">
                  {errors.activeIngredients[index]?.name?.message}
                </span>
              ) : null}
            </label>
            <label className="text-sm font-medium text-fg">
              Cantidad
              <input
                className={`${inputClass} tabular-nums`}
                inputMode="numeric"
                placeholder="200"
                {...register(`activeIngredients.${index}.amountText`)}
              />
            </label>
            <label className="text-sm font-medium text-fg">
              Unidad
              <input
                className={inputClass}
                placeholder="mg"
                {...register(`activeIngredients.${index}.unit`)}
              />
            </label>
          </div>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-fg">
            <input
              className="size-5 rounded border border-control"
              type="checkbox"
              {...register(`activeIngredients.${index}.verified`)}
            />
            Verificado contra la etiqueta
          </label>
          <RemoveButton onClick={() => remove(index)} />
        </li>
      ))}
    </RowShell>
  );
}

export function SourceFields({
  control,
  register,
  errors,
}: {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "sources" });

  return (
    <RowShell
      count={fields.length}
      hint="De dónde sale la información. Hace falta al menos una para poder marcar un beneficio con evidencia alta."
      id="fuentes"
      onAdd={() => append({ label: "", url: "", note: "" })}
      title="Fuentes"
    >
      {fields.map((field, index) => (
        <li className="rounded-card bg-background p-3" key={field.id}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-fg">
              Qué es
              <input
                className={inputClass}
                placeholder="Etiqueta del producto"
                {...register(`sources.${index}.label`)}
              />
              {errors.sources?.[index]?.label ? (
                <span className="mt-1 block text-sm text-destructive">
                  {errors.sources[index]?.label?.message}
                </span>
              ) : null}
            </label>
            <label className="text-sm font-medium text-fg">
              Enlace <span className="font-normal text-fg-muted">(opcional)</span>
              <input
                className={inputClass}
                placeholder="https://…"
                {...register(`sources.${index}.url`)}
              />
            </label>
            <label className="text-sm font-medium text-fg">
              Nota <span className="font-normal text-fg-muted">(opcional)</span>
              <input
                className={inputClass}
                placeholder="Revisada el 18 de agosto"
                {...register(`sources.${index}.note`)}
              />
            </label>
          </div>
          <RemoveButton onClick={() => remove(index)} />
        </li>
      ))}
    </RowShell>
  );
}
