import { sql } from "drizzle-orm";

import { loadEnv } from "../src/lib/load-env.ts";
import { PROMPT_SEEDS } from "./prompt-seeds.ts";

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
    // `last_resort` lo saca de la rotacion normal: seguir la cuenta no es un
    // cierre, y contestarle "siguenos" a quien pregunto que ingredientes tiene
    // cambia una respuesta util por un seguidor. Sale solo cuando no hay otro
    // CTA disponible. Campo de la regla, no lista en el codigo.
    value: { cta: "Sigue la cuenta para ver los proximos lives", last_resort: true },
    active: true,
  },
  {
    key: "canal_whatsapp",
    // `closes_sale` le dice al orquestador que este CTA cierra una venta, asi
    // que es el que sale cuando la pregunta es de precio o de compra en vez de
    // rotar a "sigue la cuenta". Es un campo de la regla y no una lista de
    // claves en el codigo: un CTA nuevo se marca aqui sin tocar el orquestador.
    value: {
      cta: "Escríbenos al número que ves en pantalla y te apartamos el tuyo",
      closes_sale: true,
    },
    active: true,
  },
  {
    key: "cupon_por_seguir",
    value: { message: "Configura el cupon vigente antes de activarlo" },
    active: false,
  },
];

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

      // La lista de prompts vive en `prompt-seeds.ts` y en ningun otro sitio.
      // Aqui habia una copia —un arreglo de nombres mas una escalera de
      // ternarios para elegir el cuerpo— y se desincronizo en el primer prompt
      // nuevo: los dos de la pasada de beneficios quedaron fuera, asi que la
      // semilla no los publicaba y la traza no podia nombrarlos. Un solo lugar.
      await tx
        .insert(prompts)
        .values(PROMPT_SEEDS.map((seed) => ({ ...seed, version: 1, active: true })))
        .onConflictDoUpdate({
          target: [prompts.name, prompts.version],
          set: { body: sql`excluded.body`, active: sql`excluded.active` },
        });

      const [product] = await tx
        .insert(products)
        .values({
          id: PRODUCT_ID,
          sku: "DEMO-CREATINA-001",
          name: "Creatina monohidratada",
          usageMode: "Una porción de 5 g al día, disuelta en agua o en tu bebida.",
          brand: "Super Store Demo",
          category: "Rendimiento deportivo",
          presentation: "Frasco de 60 porciones",
          format: "polvo",
          description:
            "Suplemento de creatina monohidratada en polvo para complementar una rutina deportiva.",
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
              // Una respuesta de FAQ es la que el Copilot va a decir tal cual,
              // asi que tiene que responder. "Sigue la porcion indicada en la
              // etiqueta" era el ejemplo sembrado, y en camara salia como
              // "mira la etiqueta": la clienta pregunta justamente porque no la
              // tiene enfrente.
              question: "¿Como se usa?",
              answer:
                "Una porcion al dia, disuelta en agua o en tu bebida, en cualquier momento del dia.",
            },
            {
              question: "¿Cuanto dura un frasco?",
              answer: "Trae 60 porciones, asi que tomando una al dia rinde dos meses.",
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
              // Un diferencial se le dice a la clienta, asi que se escribe en
              // sus palabras. "Se mantiene en el Knowledge Hub" nombraba una
              // herramienta interna que ella no conoce, y el Copilot lo repetia
              // tal cual en camara porque el modelo usa la ficha con fidelidad.
              claim: "Etiqueta e ingredientes a la vista",
              evidence: "La porcion y los ingredientes vienen declarados en el empaque.",
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
          set: {
            sku: sql`excluded.sku`,
            description: sql`excluded.description`,
            // El modo de uso viaja en el upsert: sin el, `pnpm db:seed` sobre una
            // base que ya tenia la ficha semilla la dejaba sin lo que la columna
            // vino a resolver.
            usageMode: sql`excluded.usage_mode`,
            updatedAt: new Date(),
          },
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
            fileSizeLimit: env.SUPABASE_MAX_UPLOAD_BYTES,
            allowedMimeTypes: [
              "audio/mpeg",
              "audio/mp4",
              "audio/wav",
              "audio/ogg",
              "audio/webm",
              "video/mp4",
            ],
          })
        : await supabase.storage.createBucket(env.SUPABASE_RECORDINGS_BUCKET, {
            public: false,
            fileSizeLimit: env.SUPABASE_MAX_UPLOAD_BYTES,
            allowedMimeTypes: [
              "audio/mpeg",
              "audio/mp4",
              "audio/wav",
              "audio/ogg",
              "audio/webm",
              "video/mp4",
            ],
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
