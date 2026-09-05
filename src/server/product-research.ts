import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "../db/client.ts";
import { products, prompts } from "../db/schema.ts";
import { createAiGateway, type GenerateTextResult } from "../lib/ai/gateway.ts";
import {
  buildResearchProductPrompt,
  buildStructureProductPrompt,
  researchRetryMessage,
} from "../lib/ai/prompts/research-product.ts";
import { buildSafetyLayerPrompt } from "../lib/ai/prompts/safety-layer.ts";
import {
  type RepairedCard,
  type ResearchedBenefits,
  type ResearchedProduct,
  researchedBenefitsSchema,
  researchedProductSchema,
  type SafetyLayer,
  safetyLayerSchema,
} from "../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { resolveCitations } from "../lib/research-citations.ts";
import { repairUntilValid } from "./card-repair.ts";
import { researchToProductPatch } from "../lib/research-patch.ts";
import {
  buildResearchBenefitsPrompt,
  buildStructureBenefitsPrompt,
} from "../lib/ai/prompts/research-benefits.ts";
import { logFailure } from "../lib/log.ts";
import { productInputSchema } from "../lib/validation/product.ts";
import { writeLlmCall } from "./llm-calls.ts";

type ResearchDatabase = Pick<typeof db, "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type ProductResearchDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: ResearchDatabase;
  /** Paso 1: busca en internet y devuelve prosa mas las fuentes que abrio. */
  search?: (input: {
    advisorId: string | null;
    promptId: string | null;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<GenerateTextResult>;
  /** Paso 2: reordena esa prosa en el contrato de la ficha, sin buscar. */
  structure?: (
    input: StructuredOutputInput<ResearchedProduct>,
  ) => Promise<StructuredOutputResult<ResearchedProduct>>;
  /**
   * Paso 2b: LOS BENEFICIOS, en su propia busqueda.
   *
   * Aparte del paso 1 porque son dos preguntas distintas y la segunda perdia.
   * El paso 1 busca el FRASCO —etiqueta, panel, presentacion, precio— y su regla
   * es que todo salga de ahi. Para que sirve un ingrediente no esta en el panel,
   * asi que con esa regla puesta el modelo solo podia escribir el panel: 47 de
   * 154 fichas del catalogo tenian la dosis en el lugar del beneficio.
   *
   * Esta busca el INGREDIENTE, en fuentes de evidencia, y con la frontera legal
   * viajando junto a la pregunta en vez de competir con cincuenta reglas de
   * etiqueta.
   */
  searchBenefits?: (input: {
    advisorId: string | null;
    promptId: string | null;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<GenerateTextResult>;
  structureBenefits?: (
    input: StructuredOutputInput<ResearchedBenefits>,
  ) => Promise<StructuredOutputResult<ResearchedBenefits>>;
  /**
   * Paso 3: clasifica el riesgo de decir cada cosa en camara.
   *
   * Llamada aparte y no una seccion mas del paso 2: investigar, ordenar y
   * decidir que se puede decir son tres trabajos, y pedirle los tres a la misma
   * llamada hace que descuide uno.
   */
  classifySafety?: (
    input: StructuredOutputInput<SafetyLayer>,
  ) => Promise<StructuredOutputResult<SafetyLayer>>;
  /**
   * Paso 4: corrige los campos que el gate rechazo, con el error en la mano.
   *
   * Medido: tres corridas del mismo producto fallaron por tres reglas distintas
   * y cada una de una linea. Sin este paso, cada intento vuelve a investigar
   * desde cero a ciegas —cuatro pasadas sobre 149 fichas dieron 128, 138, 140 y
   * 143—; con el error de vuelta, arreglar dos palabras es una llamada corta.
   */
  repair?: (
    input: StructuredOutputInput<RepairedCard>,
  ) => Promise<StructuredOutputResult<RepairedCard>>;
  /** Sigue el redirect del buscador hasta la pagina real. */
  resolveCitation?: (url: string) => Promise<{ url: string }>;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

function dependencies(options: ProductResearchDependencies) {
  return {
    authorize: options.authorize ?? requireRole,
    database: options.database ?? db,
    search:
      options.search ??
      ((input: Parameters<NonNullable<ProductResearchDependencies["search"]>>[0]) =>
        aiGateway.generateText({
          advisorId: input.advisorId,
          purpose: "research_product",
          promptId: input.promptId,
          system: input.system,
          messages: input.messages,
          maxTokens: 6_000,
          effort: "high",
          // El unico call site del repo que enciende la busqueda del proveedor.
          searchGrounding: true,
        })),
    structure:
      options.structure ??
      ((input: StructuredOutputInput<ResearchedProduct>) => generateStructured(input, aiGateway)),
    searchBenefits:
      options.searchBenefits ??
      ((input: Parameters<NonNullable<ProductResearchDependencies["searchBenefits"]>>[0]) =>
        aiGateway.generateText({
          advisorId: input.advisorId,
          purpose: "research_benefits",
          promptId: input.promptId,
          system: input.system,
          messages: input.messages,
          maxTokens: 4_000,
          effort: "high",
          searchGrounding: true,
        })),
    structureBenefits:
      options.structureBenefits ??
      ((input: StructuredOutputInput<ResearchedBenefits>) => generateStructured(input, aiGateway)),
    classifySafety:
      options.classifySafety ??
      ((input: StructuredOutputInput<SafetyLayer>) => generateStructured(input, aiGateway)),
    repair:
      options.repair ??
      ((input: StructuredOutputInput<RepairedCard>) => generateStructured(input, aiGateway)),
  };
}

async function activePromptId(database: ResearchDatabase, name: string) {
  const [prompt] = await database
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.active, true)))
    .orderBy(desc(prompts.version))
    .limit(1);
  return prompt?.id ?? null;
}

/**
 * Rearma el contenido de una ficha con busqueda web.
 *
 * Dos llamadas y no una: el proveedor no acepta herramienta de busqueda y
 * esquema de respuesta en la misma peticion. La primera trae prosa y —lo que
 * importa— la lista de paginas que realmente abrio; la segunda solo reordena.
 *
 * Si la busqueda no devuelve ni una fuente, no se escribe nada. Una ficha del
 * Hub sin fuente es peor que una ficha vieja: la asesora la lee en camara
 * creyendo que alguien la respaldo.
 */
export async function researchProduct(
  productId: string,
  options: ProductResearchDependencies = {},
) {
  const {
    authorize,
    database,
    search,
    structure,
    searchBenefits,
    structureBenefits,
    classifySafety,
    repair,
  } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const [product] = await database
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "La ficha no existe." } };
  }

  // Las hermanas de catalogo: mismas palabras en el nombre o misma marca. Se le
  // dan al investigador para que sepa de cuales distinguir esta referencia, que
  // es justo lo contrario de mezclarlas.
  const siblings = await database
    .select({
      name: products.name,
      brand: products.brand,
      presentation: products.presentation,
    })
    .from(products)
    .where(and(eq(products.category, product.category), ne(products.id, product.id)))
    .limit(200);
  const productWords = new Set(
    product.name
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 3),
  );
  const related = siblings
    .filter(
      (item) =>
        item.brand === product.brand ||
        item.name
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .some((word) => word.length > 3 && productWords.has(word)),
    )
    .slice(0, 8);

  const researchPrompt = buildResearchProductPrompt(product, related);
  const researchPromptId = await activePromptId(database, "research_product");
  let found = await search({
    advisorId: authorization.data.id,
    promptId: researchPromptId,
    system: researchPrompt.system,
    messages: researchPrompt.messages,
  });
  if (!found.ok) return found;
  if (found.data.citations.length === 0) {
    // Buscar es decision del modelo, no una orden: a veces contesta de memoria
    // y la respuesta llega sin una sola fuente. Se insiste una vez —observado en
    // pruebas: el segundo intento si busca— y si vuelve seca, no se escribe.
    found = await search({
      advisorId: authorization.data.id,
      promptId: researchPromptId,
      system: researchPrompt.system,
      messages: [
        ...researchPrompt.messages,
        { role: "assistant" as const, content: found.data.text },
        researchRetryMessage(),
      ],
    });
    if (!found.ok) return found;
  }
  if (found.data.citations.length === 0) {
    return {
      ok: false as const,
      error: {
        code: "NO_SOURCES",
        message: "La busqueda no devolvio ninguna fuente; la ficha queda como estaba.",
      },
    };
  }
  // Las fuentes se resuelven antes de escribirlas: el proveedor entrega su
  // propio redirect, y en la ficha tiene que quedar la pagina real.
  const citations = await resolveCitations(found.data.citations, options.resolveCitation);

  const structurePrompt = buildStructureProductPrompt({
    research: found.data.text,
    citations,
  });
  const structured = await structure({
    advisorId: authorization.data.id,
    purpose: "structure_product",
    promptId: await activePromptId(database, "structure_product"),
    schema: researchedProductSchema,
    system: structurePrompt.system,
    messages: structurePrompt.messages,
    maxTokens: 8_000,
    effort: "high",
  });
  if (!structured.ok) return structured;

  // Paso 2b: los beneficios, con su propia busqueda al ingrediente.
  //
  // Corre DESPUES de estructurar porque necesita los ingredientes tal como van a
  // quedar en la ficha: colgar un beneficio de un ingrediente que la ficha no
  // declara es la forma mas facil de que el gate lo rechace.
  //
  // Si falla, la ficha se escribe con los beneficios que trajo el paso 2. Son
  // peores —de ahi este paso— pero perder la investigacion entera por un fallo
  // de una pasada opcional seria peor todavia.
  const declaredIngredients = structured.data.value.active_ingredients.map(
    (ingredient) => ingredient.name,
  );
  let benefits: ResearchedBenefits | null = null;
  if (declaredIngredients.length === 0) {
    logFailure(
      "beneficios/ingredientes",
      `${product.name}: la ficha no declara ingredientes activos`,
    );
  } else {
    const benefitsPrompt = buildResearchBenefitsPrompt({
      name: product.name,
      brand: product.brand,
      activeIngredients: declaredIngredients,
    });
    const benefitsPromptId = await activePromptId(database, "research_benefits");
    let found = await searchBenefits({
      advisorId: authorization.data.id,
      promptId: benefitsPromptId,
      system: benefitsPrompt.system,
      messages: benefitsPrompt.messages,
    });

    // Se insiste una vez, igual que el paso 1 y por el mismo motivo: buscar es
    // decision del modelo, no una orden, y con ingredientes que "cree conocer"
    // contesta de memoria y la respuesta llega sin una sola fuente. Medido en
    // este mismo paso: la primera pasada del arandano volvio seca y la ficha se
    // quedo con los beneficios de la etiqueta.
    if (found.ok && found.data.citations.length === 0) {
      found = await searchBenefits({
        advisorId: authorization.data.id,
        promptId: benefitsPromptId,
        system: benefitsPrompt.system,
        messages: [
          ...benefitsPrompt.messages,
          { role: "assistant" as const, content: found.data.text },
          researchRetryMessage(),
        ],
      });
    }

    // Sin una sola fuente no se escriben beneficios nuevos: unos beneficios de
    // funcion sin respaldo son exactamente lo que este paso existe para evitar.
    // Cada salida se registra. Un paso que cae al fallback en silencio deja la
    // ficha con los beneficios de la etiqueta y nada que lo delate: fue asi como
    // 47 fichas del catalogo llegaron a produccion diciendo la dosis.
    if (!found.ok) {
      logFailure(
        "beneficios/busqueda",
        `${product.name}: ${found.error.code} ${found.error.message}`,
      );
    } else if (found.data.citations.length === 0) {
      logFailure("beneficios/busqueda", `${product.name}: la busqueda no devolvio ninguna fuente`);
    }

    if (found.ok && found.data.citations.length > 0) {
      const shaped = buildStructureBenefitsPrompt({
        research: found.data.text,
        citations: await resolveCitations(found.data.citations, options.resolveCitation),
        declaredIngredients,
      });
      const structuredBenefits = await structureBenefits({
        advisorId: authorization.data.id,
        purpose: "structure_benefits",
        promptId: await activePromptId(database, "structure_benefits"),
        schema: researchedBenefitsSchema,
        system: shaped.system,
        messages: shaped.messages,
        maxTokens: 4_000,
        effort: "high",
      });
      if (structuredBenefits.ok) {
        benefits = structuredBenefits.data.value;
        if (structuredBenefits.data.value.sin_funcion_documentada.length > 0) {
          logFailure(
            "beneficios/sin-funcion",
            `${product.name}: ${structuredBenefits.data.value.sin_funcion_documentada.join(", ")}`,
          );
        }
      } else {
        logFailure(
          "beneficios/estructura",
          `${product.name}: ${structuredBenefits.error.code} ${structuredBenefits.error.message}`,
        );
      }
    }
  }

  // Paso 3: la capa de seguridad. Si falla, la ficha se escribe igual con lo
  // investigado y sin los campos de comunicacion: perder la clasificacion es
  // recuperable —se vuelve a correr—, perder la investigacion con sus fuentes no.
  const safetyPrompt = buildSafetyLayerPrompt({
    product: {
      name: product.name,
      brand: product.brand,
      category: product.category,
      presentation: product.presentation,
    },
    researched: structured.data.value,
  });
  const safety = await classifySafety({
    advisorId: authorization.data.id,
    purpose: "safety_layer",
    promptId: await activePromptId(database, "safety_layer"),
    schema: safetyLayerSchema,
    system: safetyPrompt.system,
    messages: safetyPrompt.messages,
    maxTokens: 4_000,
    effort: "high",
  });

  let patch = researchToProductPatch(
    structured.data.value,
    citations,
    safety.ok ? safety.data.value : null,
    benefits,
  );
  // Se valida contra el esquema de la ficha antes de escribir: el modelo puede
  // cumplir su contrato y aun asi violar el del producto.
  // La fila trae `null` donde el esquema de entrada espera ausencia: `sku` e
  // `imageUrl` son opcionales, no nulables. Sin esta traduccion la validacion
  // falla por una ficha sin SKU, que es la mitad del Hub.
  // El precio no lo decide una busqueda: es una decision comercial.
  const fixed = {
    sku: product.sku ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    priceCop: product.priceCop,
  };
  const candidate: Record<string, unknown> = { ...product, ...patch, ...fixed };
  let parsed = productInputSchema.safeParse(candidate);

  const repaired = await repairUntilValid({
    patch,
    base: { ...product, ...fixed },
    advisorId: authorization.data.id,
    promptId: await activePromptId(database, "structured_repair"),
    repair,
  });
  patch = repaired.patch as typeof patch;
  parsed = repaired.parsed;

  if (!parsed.success) {
    // El mensaje nombra el campo y el motivo: un lote de 149 que solo dice
    // "no cumple el contrato" obliga a reinvestigar para averiguar que fallo.
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "ficha"}: ${issue.message}`)
      .join(" · ");
    return {
      ok: false as const,
      error: {
        code: "INVALID_RESEARCH",
        message: `La investigacion no cumple el contrato de la ficha. ${detail}`,
      },
    };
  }

  try {
    const [updated] = await database
      .update(products)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning();
    if (!updated) throw new Error("No se actualizo la ficha.");
    return {
      ok: true as const,
      data: { product: updated, sources: citations.length, safetyApplied: safety.ok },
    };
  } catch (error) {
    // La causa se registra o el fallo es irrepetible: una ficha que falla al
    // guardar lo hace por algo concreto —una restriccion, un tipo, un dato
    // demasiado largo— y sin el detalle solo queda reinvestigarla para volver a
    // ver el mismo "INTERNAL". Medido: una ficha del catalogo fallo asi en dos
    // lotes seguidos sin decir por que.
    logFailure(
      "investigacion/guardado",
      `${product.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar la ficha investigada." },
    };
  }
}
