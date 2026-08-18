import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, products } from "../../src/db/schema.ts";
import { getSupabaseAdminEnv, getSupabasePublicEnv } from "../../src/lib/env.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("supabase");
const { url, publishableKey } = getSupabasePublicEnv();
const { secretKey } = getSupabaseAdminEnv();
const authAdmin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const advisorClient = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminClient = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = "Local-test-only-5d!sT9#b";
const advisorUser = { id: randomUUID(), email: `product-advisor-${randomUUID()}@example.test` };
const adminUser = { id: randomUUID(), email: `product-admin-${randomUUID()}@example.test` };
let existingProductId = "";

beforeAll(async () => {
  for (const user of [advisorUser, adminUser]) {
    const { error } = await authAdmin.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }
  await connection.db.insert(advisors).values([
    {
      id: advisorUser.id,
      email: advisorUser.email,
      displayName: "Product Advisor",
      role: "asesor",
    },
    {
      id: adminUser.id,
      email: adminUser.email,
      displayName: "Product Admin",
      role: "admin",
    },
  ]);
  const parsed = productInputSchema.parse(validProductInput({ name: "RLS existing product" }));
  const [product] = await connection.db
    .insert(products)
    .values(parsed)
    .returning({ id: products.id });
  if (!product) throw new Error("No se pudo preparar el producto RLS.");
  existingProductId = product.id;

  const advisorSignIn = await advisorClient.auth.signInWithPassword({
    email: advisorUser.email,
    password,
  });
  const adminSignIn = await adminClient.auth.signInWithPassword({
    email: adminUser.email,
    password,
  });
  if (advisorSignIn.error) throw advisorSignIn.error;
  if (adminSignIn.error) throw adminSignIn.error;
});

afterAll(async () => {
  if (existingProductId) {
    await connection.db.delete(products).where(eq(products.id, existingProductId));
  }
  await connection.db.delete(advisors).where(eq(advisors.id, advisorUser.id));
  await connection.db.delete(advisors).where(eq(advisors.id, adminUser.id));
  await Promise.all([
    authAdmin.auth.admin.deleteUser(advisorUser.id),
    authAdmin.auth.admin.deleteUser(adminUser.id),
  ]);
  await connection.close();
});

describe("products RLS", () => {
  it("denies advisor inserts and updates without changing rows", async () => {
    const blockedName = `Blocked ${randomUUID()}`;
    const { error: insertError } = await advisorClient.from("products").insert({
      name: blockedName,
      brand: "RLS test",
      category: "test",
      presentation: "unit",
      format: "unit",
    });
    const { data: updateData, error: updateError } = await advisorClient
      .from("products")
      .update({ name: blockedName })
      .eq("id", existingProductId)
      .select("id");

    expect(insertError?.code).toBe("42501");
    expect(updateError).toBeNull();
    expect(updateData).toEqual([]);

    const inserted = await connection.db
      .select()
      .from(products)
      .where(eq(products.name, blockedName));
    const [existing] = await connection.db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, existingProductId));
    expect(inserted).toHaveLength(0);
    expect(existing?.name).toBe("RLS existing product");
  });

  it("allows an active admin to write through the Data API", async () => {
    const name = `Admin RLS ${randomUUID()}`;
    const { data, error } = await adminClient
      .from("products")
      .insert({
        name,
        brand: "RLS test",
        category: "test",
        presentation: "unit",
        format: "unit",
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toEqual(expect.any(String));
    if (data?.id) await connection.db.delete(products).where(eq(products.id, data.id));
  });
});
