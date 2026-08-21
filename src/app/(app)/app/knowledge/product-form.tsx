"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { deleteProductAction, saveProductAction } from "./actions.ts";
import { BenefitsFields } from "./benefits-fields.tsx";
import { IngredientFields, SourceFields } from "./ingredient-fields.tsx";
import { PairListFields } from "./pair-list-fields.tsx";
import { PriceFields } from "./price-fields.tsx";
import {
  type EditableProduct,
  productFormDefaults,
  productFormSchema,
  type ProductFormValues,
  toProductInput,
} from "./product-form-model.ts";

const inputClass = "mt-1 w-full rounded-card border bg-surface px-3 py-2";

export function ProductForm({ product }: { product?: EditableProduct }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: productFormDefaults(product),
  });

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const result = await saveProductAction(product?.id ?? null, toProductInput(values, product));
      if (!result.ok) {
        if (
          "field" in result.error &&
          typeof result.error.field === "string" &&
          result.error.field
        ) {
          const fieldMap: Partial<Record<string, keyof ProductFormValues>> = {
            benefits: "benefits",
            claimsAllowed: "claimsAllowedText",
            claimsCaution: "claimsCautionText",
            claimsForbidden: "claimsForbiddenText",
            complementProductIds: "complementProductIdsText",
            priceCop: "priceCopText",
          };
          const field =
            fieldMap[result.error.field] ?? (result.error.field as keyof ProductFormValues);
          setError(field, { message: result.error.message });
        }
        setServerError(result.error.message);
        return;
      }
      router.push("/app/knowledge");
      router.refresh();
    } catch {
      setServerError("Revisa los campos estructurados y vuelve a intentar.");
    }
  });

  async function remove() {
    if (!product || !window.confirm("¿Eliminar esta ficha? Esta acción no se puede deshacer."))
      return;
    setServerError(undefined);
    const result = await deleteProductAction(product.id);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    router.push("/app/knowledge");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={submit}>
      <fieldset className="space-y-6" disabled={isSubmitting}>
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold text-fg">Identidad del producto</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(
              [
                ["name", "Nombre comercial"],
                ["brand", "Marca"],
                ["category", "Categoría"],
                ["presentation", "Presentación"],
                ["format", "Formato"],
              ] as const
            ).map(([name, label]) => (
              <label className="text-sm font-medium text-fg" key={name}>
                {label}
                <input className={inputClass} {...register(name)} />
                {errors[name] ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {errors[name]?.message}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </section>

        <BenefitsFields errors={errors} register={register} />

        <PriceFields errors={errors} register={register} watch={watch} />

        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold text-fg">Conocimiento estructurado</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Es lo que el Copilot puede decir en cámara. Todo lo que escribas aquí se dice tal cual,
            así que va en palabras de la clienta.
          </p>
          <div className="mt-4 space-y-4">
            <IngredientFields control={control} errors={errors} register={register} />
            <PairListFields
              control={control}
              errors={errors}
              hint="Lo que preguntan seguido. La respuesta es la que dirá el Copilot."
              labels={["Pregunta de la clienta", "Respuesta"]}
              name="faqs"
              placeholders={["¿Cómo se toma?", "Una porción al día con agua."]}
              register={register}
              title="Preguntas frecuentes"
            />
            <PairListFields
              control={control}
              errors={errors}
              hint="Las dudas que frenan la compra, con la respuesta que las desarma."
              labels={["Lo que dice la clienta", "Cómo se responde"]}
              name="objections"
              placeholders={["No conozco la marca", "Es importado de Estados Unidos."]}
              register={register}
              title="Objeciones"
            />
            <PairListFields
              control={control}
              errors={errors}
              hint="Por qué creerte. La evidencia es lo que lo sostiene, y tiene que ser comprobable."
              labels={["Qué lo diferencia", "Con qué se comprueba"]}
              name="differentiators"
              placeholders={[
                "Etiqueta e ingredientes a la vista",
                "Vienen declarados en el empaque.",
              ]}
              register={register}
              title="Diferenciadores"
            />
            <SourceFields control={control} errors={errors} register={register} />
          </div>
        </section>

        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold text-fg">Comunicación responsable</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-fg lg:col-span-2">
              Precauciones
              <textarea className={`${inputClass} min-h-24`} {...register("precautions")} />
            </label>
            {(
              [
                ["claimsAllowedText", "Afirmaciones permitidas"],
                ["claimsCautionText", "Afirmaciones con cautela"],
                ["claimsForbiddenText", "Afirmaciones prohibidas"],
                ["complementProductIdsText", "IDs de productos complementarios"],
              ] as const
            ).map(([name, label]) => (
              <label className="text-sm font-medium text-fg" key={name}>
                {label}
                <textarea
                  className={`${inputClass} min-h-24`}
                  placeholder="Una entrada por línea"
                  {...register(name)}
                />
              </label>
            ))}
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-medium text-fg">
            <input className="size-5 rounded border" type="checkbox" {...register("verified")} />
            Ficha revisada por una persona
          </label>
        </section>
      </fieldset>

      {serverError ? (
        <p
          className="rounded-card border border-destructive bg-confidence-low-bg p-3 text-sm text-confidence-low-fg"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {product ? (
          <button
            className="min-h-11 rounded-card border border-destructive px-4 font-semibold text-destructive hover:bg-confidence-low-bg"
            onClick={remove}
            type="button"
          >
            Eliminar ficha
          </button>
        ) : (
          <span />
        )}
        <button
          className="min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Guardando…" : product ? "Guardar cambios" : "Crear ficha"}
        </button>
      </div>
    </form>
  );
}
