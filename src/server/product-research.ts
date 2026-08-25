import { and, desc, eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { products, prompts } from "../db/schema.ts";
import { createAiGateway, type GenerateTextResult } from "../lib/ai/gateway.ts";
import {
  buildResearchProductPrompt,
  buildStructureProductPrompt,
  researchRetryMessage,
} from "../lib/ai/prompts/research-product.ts";
import { type ResearchedProduct, researchedProductSchema } from "../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { resolveCitations } from "../lib/research-citations.ts";
import { researchToProductPatch } from "../lib/research-patch.ts";
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
  const { authorize, database, search, structure } = dependencies(options);
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

  const researchPrompt = buildResearchProductPrompt(product);
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

  const patch = researchToProductPatch(structured.data.value, citations);
  // Se valida contra el esquema de la ficha antes de escribir: el modelo puede
  // cumplir su contrato y aun asi violar el del producto.
  const parsed = productInputSchema.safeParse({
    ...product,
    ...patch,
    // La fila trae `null` donde el esquema de entrada espera ausencia: `sku` e
    // `imageUrl` son opcionales, no nulables. Sin esta traduccion la validacion
    // falla por una ficha sin SKU, que es la mitad del Hub.
    sku: product.sku ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    // El precio no lo decide una busqueda: es una decision comercial.
    priceCop: product.priceCop,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_RESEARCH",
        message: "La investigacion no cumple el contrato de la ficha.",
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
      data: { product: updated, sources: citations.length },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar la ficha investigada." },
    };
  }
}
