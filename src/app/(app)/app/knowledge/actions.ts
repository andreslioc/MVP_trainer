"use server";

import { revalidatePath } from "next/cache";

import type { ProductInput } from "../../../../lib/validation/product.ts";
import { createProduct, deleteProduct, updateProduct } from "../../../../server/products.ts";

export async function saveProductAction(id: string | null, input: ProductInput) {
  const result = id ? await updateProduct(id, input) : await createProduct(input);
  if (result.ok) {
    revalidatePath("/app/knowledge");
    revalidatePath(`/app/knowledge/${result.data.id}`);
  }
  return result;
}

export async function deleteProductAction(id: string) {
  const result = await deleteProduct(id);
  if (result.ok) revalidatePath("/app/knowledge");
  return result;
}
