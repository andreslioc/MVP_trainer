import { asc, eq, sql } from "drizzle-orm";

import { db } from "../db/client.ts";
import { products } from "../db/schema.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import {
  type ProductInput,
  productInputSchema,
  productValidationError,
} from "../lib/validation/product.ts";

/**
 * La ficha como sale de la base.
 *
 * Se exporta desde aqui —y no se importa `db/schema` en una pagina— porque
 * `src/app` no cruza a `src/db`, ni para un tipo: el dia que la tabla cambie de
 * forma, quien lo absorbe es esta capa.
 */
export type ProductRecord = typeof products.$inferSelect;

type ProductDatabase = Pick<typeof db, "delete" | "insert" | "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type ProductDependencies = {
  database?: ProductDatabase;
  authorize?: Authorize;
};

function dependencies(options: ProductDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
  };
}

export async function listProducts(options: ProductDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select()
      .from(products)
      .orderBy(sql`${products.verifiedAt} asc nulls first`, asc(products.name));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "PRODUCT_LIST_FAILED", message: "No se pudieron cargar las fichas." },
    };
  }
}

export async function getProduct(id: string, options: ProductDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsedId = productId(id);
  if (!parsedId.ok) return parsedId;

  try {
    const [row] = await database
      .select()
      .from(products)
      .where(eq(products.id, parsedId.data))
      .limit(1);
    if (!row) {
      return {
        ok: false as const,
        error: { code: "PRODUCT_NOT_FOUND", message: "La ficha no existe." },
      };
    }
    return { ok: true as const, data: row };
  } catch {
    return {
      ok: false as const,
      error: { code: "PRODUCT_READ_FAILED", message: "No se pudo cargar la ficha." },
    };
  }
}

export async function createProduct(input: ProductInput, options: ProductDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: productValidationError(parsed.error) };
  }

  try {
    const [created] = await database.insert(products).values(parsed.data).returning();
    return { ok: true as const, data: created };
  } catch {
    return {
      ok: false as const,
      error: { code: "PRODUCT_CREATE_FAILED", message: "No se pudo crear la ficha." },
    };
  }
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  options: ProductDependencies = {},
) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsedId = productId(id);
  if (!parsedId.ok) return parsedId;
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: productValidationError(parsed.error) };
  }

  try {
    const [updated] = await database
      .update(products)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(products.id, parsedId.data))
      .returning();
    if (!updated) {
      return {
        ok: false as const,
        error: { code: "PRODUCT_NOT_FOUND", message: "La ficha no existe." },
      };
    }
    return { ok: true as const, data: updated };
  } catch {
    return {
      ok: false as const,
      error: { code: "PRODUCT_UPDATE_FAILED", message: "No se pudo actualizar la ficha." },
    };
  }
}

export async function deleteProduct(id: string, options: ProductDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsedId = productId(id);
  if (!parsedId.ok) return parsedId;

  try {
    const [deleted] = await database
      .delete(products)
      .where(eq(products.id, parsedId.data))
      .returning({ id: products.id });
    if (!deleted) {
      return {
        ok: false as const,
        error: { code: "PRODUCT_NOT_FOUND", message: "La ficha no existe." },
      };
    }
    return { ok: true as const, data: deleted };
  } catch {
    return {
      ok: false as const,
      error: {
        code: "PRODUCT_DELETE_FAILED",
        message: "No se puede borrar una ficha que conserva historial.",
      },
    };
  }
}

function productId(id: string) {
  const parsed = productInputSchema.shape.complementProductIds.element.safeParse(id);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_PRODUCT_ID", message: "El identificador no es válido.", field: "id" },
    };
  }
  return { ok: true as const, data: parsed.data };
}
