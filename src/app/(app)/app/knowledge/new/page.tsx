import { redirect } from "next/navigation";

import { requireRole } from "../../../../../lib/auth.ts";
import { ProductForm } from "../product-form.tsx";

export default async function NewProductPage() {
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app/knowledge");

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Knowledge Hub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Nueva ficha de producto
      </h1>
      <p className="mt-2 text-fg-muted">
        Registra únicamente información comprobable y utilizable en vivo.
      </p>
      <ProductForm />
    </section>
  );
}
