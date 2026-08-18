import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors } from "../../src/db/schema.ts";
import { getSupabaseAdminEnv, getSupabasePublicEnv } from "../../src/lib/env.ts";
import { resolveVerifiedSession } from "../../src/lib/auth.ts";
import { createInvitedAdvisor } from "../../src/server/advisors.ts";

const connection = openDirectDatabase("supabase");
const { url, publishableKey } = getSupabasePublicEnv();
const { secretKey } = getSupabaseAdminEnv();
const adminClient = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = "Local-test-only-7q!mZ2#s";
const activeUser = {
  id: randomUUID(),
  email: `active-${randomUUID()}@example.test`,
};
const inactiveUser = {
  id: randomUUID(),
  email: `inactive-${randomUUID()}@example.test`,
};

beforeAll(async () => {
  for (const user of [activeUser, inactiveUser]) {
    const { error } = await adminClient.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }

  await connection.db.insert(advisors).values([
    {
      id: activeUser.id,
      email: activeUser.email,
      displayName: "Active Advisor",
      status: "activa",
    },
    {
      id: inactiveUser.id,
      email: inactiveUser.email,
      displayName: "Inactive Advisor",
      status: "inactiva",
    },
  ]);
});

afterAll(async () => {
  await connection.db.execute(sql`
    delete from public.advisors where id in (${activeUser.id}, ${inactiveUser.id})
  `);
  await Promise.all([
    adminClient.auth.admin.deleteUser(activeUser.id),
    adminClient.auth.admin.deleteUser(inactiveUser.id),
  ]);
  await connection.close();
});

describe("Supabase auth and RLS", () => {
  it("creates an invited Auth user and advisor with the same UUID", async () => {
    const email = `invited-${randomUUID()}@example.test`;
    const result = await createInvitedAdvisor(
      { email, displayName: "Invited Advisor", role: "asesor" },
      adminClient.auth.admin,
      connection.db,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = await adminClient.auth.admin.getUserById(result.data.id);
    expect(data.user?.id).toBe(result.data.id);
    expect(data.user?.email).toBe(email);

    await connection.db.execute(sql`delete from public.advisors where id = ${result.data.id}`);
    await adminClient.auth.admin.deleteUser(result.data.id);
  });

  it("enables RLS and installs named policies on every protected table", async () => {
    const protectedTables = [
      "advisors",
      "products",
      "commercial_rules",
      "training_questions",
      "training_sessions",
      "training_answers",
      "live_sessions",
      "copilot_exchanges",
      "live_recordings",
      "insights",
      "prompts",
      "llm_calls",
    ];
    const rlsRows = await connection.db.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in (${sql.join(
          protectedTables.map((table) => sql`${table}`),
          sql`, `,
        )})
    `);
    const policies = await connection.db.execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
    `);

    expect(rlsRows).toHaveLength(protectedTables.length);
    expect(rlsRows.every((row) => row.relrowsecurity)).toBe(true);
    for (const table of protectedTables) {
      expect(policies.some((policy) => policy.tablename === table)).toBe(true);
    }
    expect(policies).toContainEqual({
      tablename: "products",
      policyname: "products_admin_insert",
    });
    expect(policies).toContainEqual({
      tablename: "training_sessions",
      policyname: "training_sessions_advisor_select",
    });
  });

  it("allows authenticated reads but denies product writes to an advisor", async () => {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: activeUser.email,
      password,
    });
    expect(signInError).toBeNull();

    const { error: readError } = await client.from("products").select("id").limit(1);
    expect(readError).toBeNull();

    const { error: writeError } = await client.from("products").insert({
      name: "Blocked product",
      brand: "RLS test",
      category: "test",
      presentation: "unit",
      format: "unit",
    });
    expect(writeError?.code).toBe("42501");
  });

  it("signs out a valid Supabase user whose advisor row is inactive", async () => {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: inactiveUser.email,
      password,
    });
    expect(signInError).toBeNull();

    const result = await resolveVerifiedSession(client.auth, connection.db);
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "La cuenta no está activa." },
    });

    const { data } = await client.auth.getClaims();
    expect(data).toBeNull();
  });
});
