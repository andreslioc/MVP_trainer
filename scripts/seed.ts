import { sql } from "drizzle-orm";

import { COPILOT_CLASSIFY_PROMPT, COPILOT_COMPOSE_PROMPT } from "../src/lib/ai/prompts/copilot.ts";
import { GENERATE_QUESTIONS_PROMPT } from "../src/lib/ai/prompts/generate-questions.ts";
import { EVALUATE_ANSWER_PROMPT } from "../src/lib/ai/prompts/evaluate-answer.ts";
import { ANALYZE_TRANSCRIPT_PROMPT } from "../src/lib/ai/prompts/analyze-transcript.ts";
import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

const PRODUCT_ID = "018f47e6-9d20-7b6e-9c2a-6d5f4e3b2a10";

const commercialRuleSeeds = [
  {
    key: "originalidad",
    value: { message: "Productos importados de Estados Unidos" },
    active: true,
  },
  { key: "envio_gratis", value: { threshold_cop: 120000 }, active: true },
  {
    key: "promo_live",
    value: { message: "Configura la promocion vigente del live" },
    active: false,
  },
  {
    key: "seguir_tiktok",
    value: { cta: "Sigue la cuenta para ver los proximos lives" },
    active: true,
  },
  {
    key: "canal_whatsapp",
    value: { cta: "Consulta disponibilidad por el canal de WhatsApp" },
    active: true,
  },
  {
    key: "cupon_por_seguir",
    value: { message: "Configura el cupon vigente antes de activarlo" },
    active: false,
  },
];

const promptNames = [
  "generate_questions",
  "evaluate_answer",
  "copilot_classify",
  "copilot_compose_express",
  "copilot_compose_estandar",
  "copilot_compose_profunda",
  "structured_repair",
  "analyze_transcript",
  "promote_insight",
] as const;

async function main(): Promise<void> {
  const [
    { openDirectDatabase },
    { commercialRules, products, prompts, trainingQuestions },
    { env },
  ] = await Promise.all([
    import("../src/db/client.ts"),
    import("../src/db/schema.ts"),
    import("../src/lib/env.ts"),
  ]);
  const hasLocalSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY);
  const connection = openDirectDatabase(hasLocalSupabase ? "dev" : "test");

  try {
    await connection.db.transaction(async (tx) => {
      await tx
        .insert(commercialRules)
        .values(commercialRuleSeeds)
        .onConflictDoUpdate({
          target: commercialRules.key,
          set: { value: sql`excluded.value`, active: sql`excluded.active`, updatedAt: new Date() },
        });

      await tx
        .insert(prompts)
        .values(
          promptNames.map((name) => ({
            name,
            version: 1,
            body:
              name === "generate_questions"
                ? GENERATE_QUESTIONS_PROMPT
                : name === "evaluate_answer"
                  ? EVALUATE_ANSWER_PROMPT
                  : name === "copilot_classify"
                    ? COPILOT_CLASSIFY_PROMPT
                    : name.startsWith("copilot_compose_")
                      ? COPILOT_COMPOSE_PROMPT
                      : name === "analyze_transcript"
                        ? ANALYZE_TRANSCRIPT_PROMPT
                        : `Plantilla inicial versionada para ${name}.`,
            active: true,
          })),
        )
        .onConflictDoUpdate({
          target: [prompts.name, prompts.version],
          set: { body: sql`excluded.body`, active: sql`excluded.active` },
        });

      const [product] = await tx
        .insert(products)
        .values({
          id: PRODUCT_ID,
          name: "Creatina monohidratada",
          brand: "Super Store Demo",
          category: "Rendimiento deportivo",
          presentation: "Frasco de 60 porciones",
          format: "polvo",
          activeIngredients: [{ name: "Creatina monohidratada", verified: true }],
          benefits: [
            {
              rank: 1,
              claim: "Apoya el rendimiento en esfuerzos intensos",
              science_note: "Verificar dosis y contexto antes de comunicar",
              evidence_level: "media",
            },
            {
              rank: 2,
              claim: "Complementa una rutina de entrenamiento",
              science_note: "No reemplaza alimentacion ni descanso",
              evidence_level: "media",
            },
            {
              rank: 3,
              claim: "Presentacion facil de incorporar",
              science_note: "Beneficio de uso, no afirmacion medica",
              evidence_level: "baja",
            },
          ],
          faqs: [
            {
              question: "¿Como se usa?",
              answer: "Sigue la porcion indicada en la etiqueta del producto.",
            },
          ],
          objections: [
            {
              objection: "No conozco la marca",
              response: "Revisa la ficha, el empaque y las fuentes verificadas antes de decidir.",
            },
          ],
          differentiators: [
            {
              claim: "Ficha revisable",
              evidence: "La informacion se mantiene en el Knowledge Hub.",
            },
          ],
          precautions:
            "Consulta a un profesional de salud en embarazo, lactancia, enfermedad o uso de medicamentos.",
          claimsAllowed: ["Es un suplemento de creatina monohidratada."],
          claimsCaution: ["Los resultados dependen del contexto individual y de la rutina."],
          claimsForbidden: ["Cura enfermedades", "Reemplaza tratamientos medicos"],
          sources: [
            {
              label: "Fuente pendiente de verificacion humana",
              note: "No usar como evidencia alta hasta completar la revision.",
            },
          ],
        })
        .onConflictDoUpdate({
          target: [products.brand, products.name, products.presentation],
          set: { updatedAt: new Date() },
        })
        .returning({ id: products.id });

      if (!product) throw new Error("No se pudo obtener el producto semilla.");

      const questionSeeds = [
        {
          text: "¿Que contiene este producto?",
          intent: "informacion",
          difficulty: "basica",
          idealAnswer:
            "Contiene creatina monohidratada; confirma la cantidad exacta en la etiqueta.",
          criteria: ["nombra el ingrediente", "remite a la etiqueta"],
        },
        {
          text: "¿En que se diferencia de otros productos?",
          intent: "comparacion",
          difficulty: "intermedia",
          idealAnswer:
            "Solo compara datos presentes y verificados en las fichas del Knowledge Hub.",
          criteria: ["no inventa diferencias", "declara limites"],
        },
        {
          text: "¿Me garantiza resultados rapidos?",
          intent: "objecion",
          difficulty: "dificil",
          idealAnswer:
            "No se pueden garantizar resultados; dependen de la persona, la rutina y otros factores.",
          criteria: ["no garantiza resultados", "respuesta clara"],
        },
        {
          text: "Estoy embarazada y tomo medicamentos, ¿puedo usarlo?",
          intent: "seguridad",
          difficulty: "dificil",
          idealAnswer:
            "Por embarazo y medicamentos, consulta primero con un profesional de salud que conozca tu caso.",
          criteria: ["activa ruta de cautela", "no prescribe"],
        },
      ] as const;

      for (const question of questionSeeds) {
        await tx
          .insert(trainingQuestions)
          .values({
            ...question,
            criteria: [...question.criteria],
            productId: product.id,
            source: "seed",
          })
          .onConflictDoUpdate({
            target: [trainingQuestions.productId, trainingQuestions.text],
            set: {
              intent: question.intent,
              difficulty: question.difficulty,
              idealAnswer: question.idealAnswer,
              criteria: [...question.criteria],
              source: "seed",
            },
          });
      }
    });

    if (hasLocalSupabase && env.SUPABASE_RECORDINGS_BUCKET) {
      const { createAdminSupabaseClient } = await import("../src/lib/auth.ts");
      const supabase = createAdminSupabaseClient();
      const { data: bucket } = await supabase.storage.getBucket(env.SUPABASE_RECORDINGS_BUCKET);
      const bucketResult = bucket
        ? await supabase.storage.updateBucket(env.SUPABASE_RECORDINGS_BUCKET, {
            public: false,
            fileSizeLimit: 200 * 1024 * 1024,
            allowedMimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "video/mp4"],
          })
        : await supabase.storage.createBucket(env.SUPABASE_RECORDINGS_BUCKET, {
            public: false,
            fileSizeLimit: 200 * 1024 * 1024,
            allowedMimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "video/mp4"],
          });
      if (bucketResult.error) throw bucketResult.error;
    }

    console.info(
      `Seed completado en ${hasLocalSupabase ? "Supabase local" : "Postgres de pruebas"}.`,
    );
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al sembrar la base.");
  process.exitCode = 1;
});
