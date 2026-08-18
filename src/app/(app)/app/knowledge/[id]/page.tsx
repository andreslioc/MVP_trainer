import { notFound, redirect } from "next/navigation";

import { requireRole } from "../../../../../lib/auth.ts";
import { getProduct } from "../../../../../server/products.ts";
import { ProductForm } from "../product-form.tsx";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app/knowledge");

  const { id } = await params;
  const result = await getProduct(id, { authorize: async () => authorization });
  if (!result.ok) notFound();

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Knowledge Hub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Editar {result.data.name}
      </h1>
      <p className="mt-2 text-fg-muted">
        Actualiza la ficha sin perder sus fuentes ni límites de comunicación.
      </p>
      <ProductForm product={result.data} />
    </section>
  );
}
