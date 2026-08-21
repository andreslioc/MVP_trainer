import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors } from "../../src/db/schema.ts";
import { createAdvisorFromAuthUser } from "../../src/server/advisors.ts";

const connection = openDirectDatabase();

afterAll(async () => {
  await connection.close();
});

describe("database schema", () => {
  it("creates every required table by name", async () => {
    const expected = [
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
      "llm_calls",
      "prompts",
    ];
    const rows = await connection.db.execute<{ table_name: string }>(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (${sql.join(
          expected.map((name) => sql`${name}`),
          sql`, `,
        )})
    `);

    expect(rows.map((row) => row.table_name).sort()).toEqual([...expected].sort());
  });

  it("creates every enum with its exact ordered values", async () => {
    const expected: Record<string, string[]> = {
      advisor_role: ["asesor", "admin"],
      advisor_status: ["activa", "inactiva"],
      question_intent: [
        "informacion",
        "comparacion",
        "precio",
        "confianza",
        "uso",
        "compra",
        "seguridad",
        "objecion",
      ],
      question_difficulty: ["basica", "intermedia", "dificil"],
      question_source: ["seed", "generated", "live_insight"],
      length_variant: ["express", "estandar", "profunda"],
      confidence_level: ["alto", "medio", "revisar"],
      recording_status: [
        "uploaded",
        "transcribing",
        "transcribed",
        "analyzing",
        "analyzed",
        "failed",
      ],
      insight_type: ["faq", "objecion", "error", "oportunidad", "buena_practica", "riesgo_claim"],
    };
    const rows = await connection.db.execute<{
      enum_name: string;
      enum_value: string;
    }>(sql`
      select type.typname as enum_name, enum.enumlabel as enum_value
      from pg_type as type
      join pg_enum as enum on enum.enumtypid = type.oid
      join pg_namespace as namespace on namespace.oid = type.typnamespace
      where namespace.nspname = 'public'
        and type.typname in (${sql.join(
          Object.keys(expected).map((name) => sql`${name}`),
          sql`, `,
        )})
      order by type.typname, enum.enumsortorder
    `);
    const actual = Object.fromEntries(
      Object.keys(expected).map((name) => [
        name,
        rows.filter((row) => row.enum_name === name).map((row) => row.enum_value),
      ]),
    );

    expect(actual).toEqual(expected);
  });

  it("creates the required query and foreign-key indexes", async () => {
    const expectedIndexes = [
      "advisors_email_unique",
      "commercial_rules_key_unique",
      "copilot_exchanges_product_id_idx",
      "copilot_exchanges_session_created_idx",
      "insights_product_id_idx",
      "insights_promoted_question_id_idx",
      "insights_recording_type_idx",
      "live_recordings_advisor_created_idx",
      "live_recordings_expires_at_idx",
      "live_recordings_status_idx",
      "live_sessions_advisor_started_idx",
      "llm_calls_advisor_created_idx",
      "llm_calls_prompt_id_idx",
      "llm_calls_purpose_created_idx",
      "products_verified_at_idx",
      "prompts_name_version_unique",
      "training_answers_question_id_idx",
      "training_answers_session_id_idx",
      "training_questions_product_intent_idx",
      "training_questions_source_idx",
      "training_sessions_advisor_started_idx",
      "training_sessions_product_id_idx",
    ];
    const rows = await connection.db.execute<{ indexname: string }>(sql`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (${sql.join(
          expectedIndexes.map((name) => sql`${name}`),
          sql`, `,
        )})
    `);

    expect(new Set(rows.map((row) => row.indexname))).toEqual(new Set(expectedIndexes));
  });

  it("preserves the required delete behavior and keeps advisors portable", async () => {
    const expected = new Map([
      ["chat_coverage_recording_id_live_recordings_id_fk", "c"],
      ["copilot_exchanges_live_session_id_live_sessions_id_fk", "c"],
      ["copilot_exchanges_product_id_products_id_fk", "r"],
      ["insights_product_id_products_id_fk", "n"],
      ["insights_promoted_to_question_id_training_questions_id_fk", "n"],
      ["insights_recording_id_live_recordings_id_fk", "c"],
      ["live_recordings_advisor_id_advisors_id_fk", "c"],
      ["live_sessions_advisor_id_advisors_id_fk", "c"],
      // Un simulacro es de la asesora: si se borra la cuenta, se van con ella.
      ["live_simulations_advisor_id_advisors_id_fk", "c"],
      ["llm_calls_advisor_id_advisors_id_fk", "n"],
      ["llm_calls_prompt_id_prompts_id_fk", "n"],
      ["training_answers_question_id_training_questions_id_fk", "r"],
      ["training_answers_session_id_training_sessions_id_fk", "c"],
      ["training_questions_product_id_products_id_fk", "c"],
      ["training_sessions_advisor_id_advisors_id_fk", "c"],
      ["training_sessions_product_id_products_id_fk", "r"],
    ]);
    const rows = await connection.db.execute<{
      constraint_name: string;
      delete_action: string;
    }>(sql`
      select conname as constraint_name, confdeltype::text as delete_action
      from pg_constraint
      where contype = 'f' and connamespace = 'public'::regnamespace
    `);
    const actual = new Map(rows.map((row) => [row.constraint_name, row.delete_action]));

    expect(actual).toEqual(expected);
    expect([...actual.keys()].some((name) => name.startsWith("advisors_id_"))).toBe(false);
  });

  it("stores the exact auth UUID through the sole advisor writer", async () => {
    const id = randomUUID();
    const result = await createAdvisorFromAuthUser(
      { id, email: `schema-${id}@example.com`, displayName: "Schema Test" },
      connection.db,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(id);

    const [stored] = await connection.db.select().from(advisors).where(eq(advisors.id, id));
    expect(stored?.id).toBe(id);
    await connection.db.delete(advisors).where(eq(advisors.id, id));
  });

  it("mantiene RLS activo en chat_coverage", async () => {
    // Una politica sin `enable row level security` no filtra nada y no se nota:
    // pg_policies la muestra igual. chat_coverage nacio asi —politica sin RLS—
    // y quedo abierta a cualquier autenticado por la API de Supabase hasta que
    // alguien lo miro. Esta prueba es lo que hace que se note.
    //
    // Solo se afirma sobre chat_coverage y no sobre las demas tablas privadas
    // porque el `enable` de las otras vive dentro del guardia de rol de la
    // migracion 0001: fuera de Supabase se salta, asi que aqui aparecen en
    // false y afirmar lo contrario seria afirmar sobre el entorno equivocado.
    const [row] = await connection.db.execute<{ relrowsecurity: boolean }>(sql`
      select c.relrowsecurity
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'chat_coverage'
    `);

    expect(row?.relrowsecurity).toBe(true);
  });
});
