/**
 * Corre el Copilot contra preguntas reales sin pasar por la UI ni por una
 * sesion de live, para poder leer que produce el prompt de composicion.
 *
 * Escribe en `llm_calls` como cualquier otra llamada: una prueba que no deja
 * rastro en el ledger miente sobre lo que cuesta.
 *
 * Uso: pnpm tsx scripts/copilot-probe.ts <product_id>
 */

import {
  buildCopilotClassifyPrompt,
  buildCopilotComposePrompt,
} from "../src/lib/ai/prompts/copilot.ts";
import { copilotCompositionSchema, copilotIntentSchema } from "../src/lib/ai/schemas.ts";
import { generateStructured } from "../src/lib/ai/structured.ts";
import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

/** Preguntas del live del 18-ago, una por intencion. */
const PREGUNTAS = [
  "para que sirve la creatina y como se toma",
  "es original? como se que no es falsa",
  "precio???",
  "una embarazada lo puede consumir",
  "pero ese no es el original",
  "cual es la diferencia entre esos 2",
];

function palabras(texto: string) {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  const productId = process.argv[2];
  if (!productId) throw new Error("Falta el id del producto.");
  // Con una pregunta suelta como tercer argumento se prueba solo esa, sin
  // volver a pagar las otras cinco.
  const soloUna = process.argv[3];
  // `--promo=10` simula el precio especial encendido en la sesion de live.
  const promoPercent =
    Number(process.argv.find((arg) => arg.startsWith("--promo="))?.split("=")[1] ?? "") || null;
  const preguntas = soloUna ? [soloUna] : PREGUNTAS;

  const [
    { openDirectDatabase },
    { products, commercialRules },
    { eq, asc },
    { writeLlmCall },
    { createAiGateway },
  ] = await Promise.all([
    import("../src/db/client.ts"),
    import("../src/db/schema.ts"),
    import("drizzle-orm"),
    import("../src/server/llm-calls.ts"),
    import("../src/lib/ai/gateway.ts"),
  ]);
  const connection = openDirectDatabase("dev");
  const gateway = createAiGateway({ writeCall: writeLlmCall });

  try {
    const [product] = await connection.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new Error("No existe ese producto.");
    const activeRules = await connection.db
      .select({ key: commercialRules.key, value: commercialRules.value })
      .from(commercialRules)
      .where(eq(commercialRules.active, true))
      .orderBy(asc(commercialRules.key));

    console.log(
      `FICHA: ${product.brand} — ${product.name} (verificada: ${product.verifiedAt !== null})\n`,
    );

    for (const customerQuestion of preguntas) {
      const clasificado = await generateStructured(
        {
          advisorId: null,
          purpose: "copilot_classify",
          schema: copilotIntentSchema,
          ...buildCopilotClassifyPrompt(customerQuestion),
          maxTokens: 200,
          effort: "low",
        },
        gateway,
      );
      if (!clasificado.ok) {
        console.log(
          `PREGUNTA: ${customerQuestion}\n  fallo al clasificar: ${clasificado.error.message}\n`,
        );
        continue;
      }
      const intent = clasificado.data.value.intent;

      // La orquestacion se fija a mano para que el resultado sea comparable
      // entre preguntas: aqui se mira el prompt, no el orquestador.
      const orchestration = {
        cta: {
          text: "Consulta disponibilidad por el canal de WhatsApp",
          ruleKey: "canal_whatsapp",
        },
        incentive: null,
        ruleApplied: "canal_whatsapp",
      };

      const compuesto = await generateStructured(
        {
          advisorId: null,
          purpose: "copilot_compose",
          schema: copilotCompositionSchema,
          ...buildCopilotComposePrompt({
            product,
            activeRules,
            customerQuestion,
            intent,
            promoPercent,
            objective: "resolver la duda y acercar a la compra",
            tone: "cercano y directo",
            orchestration,
          }),
          maxTokens: 2_000,
          effort: "medium",
        },
        gateway,
      );

      console.log("=".repeat(78));
      console.log(`PREGUNTA  : ${customerQuestion}`);
      console.log(`INTENCION : ${intent}`);
      if (!compuesto.ok) {
        console.log(`  fallo: ${compuesto.error.message}\n`);
        continue;
      }
      const c = compuesto.data.value;
      console.log(
        `CONFIANZA : ${c.confidence}   CTA: ${c.cta_used ?? "ninguno"}   REGLA: ${c.rule_applied ?? "ninguna"}`,
      );
      console.log(
        `\nEXPRESS (${palabras(c.express)} palabras, ~${Math.ceil(palabras(c.express) / 2.5)} s):\n  ${c.express}`,
      );
      console.log(
        `\nESTANDAR (${palabras(c.estandar)} palabras, ~${Math.ceil(palabras(c.estandar) / 2.5)} s):\n  ${c.estandar}`,
      );
      // La profunda ya venia en la composicion y no se imprimia: es la unica
      // vista donde se ve si la ficha tiene fondo o solo tiene etiqueta.
      console.log(
        `\nPROFUNDA (${palabras(c.profunda)} palabras, ~${Math.ceil(palabras(c.profunda) / 2.5)} s):\n  ${c.profunda}`,
      );
      console.log("");
    }
  } finally {
    await connection.close();
  }
}

main()
  .then(() => {
    // El cliente de Postgres deja un handle abierto que mantiene vivo el bucle
    // de eventos aunque el trabajo ya termino. Es un script, no un servidor.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
