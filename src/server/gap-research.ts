import { and, desc, eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { products, prompts } from "../db/schema.ts";
import { createAiGateway, type GenerateTextResult } from "../lib/ai/gateway.ts";
import { buildStructureGapPrompt, buildVerifyGapPrompt } from "../lib/ai/prompts/verify-gap.ts";
import { type GapVerification, gapVerificationSchema } from "../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { resolveCitations } from "../lib/research-citations.ts";
import { productInputSchema } from "../lib/validation/product.ts";
import { writeLlmCall } from "./llm-calls.ts";

type GapDatabase = Pick<typeof db, "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type GapResearchDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: GapDatabase;
  search?: (input: {
    advisorId: string | null;
    promptId: string | null;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<GenerateTextResult>;
  structure?: (
    input: StructuredOutputInput<GapVerification>,
  ) => Promise<StructuredOutputResult<GapVerification>>;
  resolveCitation?: (url: string) => Promise<{ url: string }>;
  now?: () => Date;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

function dependencies(options: GapResearchDependencies) {
  return {
    authorize: options.authorize ?? requireRole,
    database: options.database ?? db,
    now: options.now ?? (() => new Date()),
    search:
      options.search ??
      ((input: Parameters<NonNullable<GapResearchDependencies["search"]>>[0]) =>
        aiGateway.generateText({
          advisorId: input.advisorId,
          purpose: "verify_gap",
          promptId: input.promptId,
          system: input.system,
          messages: input.messages,
          maxTokens: 3_000,
          effort: "high",
          searchGrounding: true,
        })),
    structure:
      options.structure ??
      ((input: StructuredOutputInput<GapVerification>) => generateStructured(input, aiGateway)),
  };
}

async function activePromptId(database: GapDatabase, name: string) {
  const [prompt] = await database
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.name, name), eq(prompts.active, true)))
    .orderBy(desc(prompts.version))
    .limit(1);
  return prompt?.id ?? null;
}

/** Fecha corta: el hueco tiene que decir CUANDO se busco, o no se sabe si esta vencido. */
function stamp(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Investiga UN hueco de una ficha y escribe el resultado en su sitio.
 *
 * No reescribe la ficha ni asciende nada a verificado: deja el hallazgo dentro
 * del propio hueco, fechado y con sus fuentes, y suma esas fuentes a la ficha.
 * Quien decide si el dato pasa a ser un campo —un ingrediente, una precaucion,
 * un diferencial— es una persona, porque de eso depende lo que se dice en
 * camara.
 *
 * Un hueco investigado y no resuelto sigue siendo una mejora: "no aparece en el
 * registro publico de INVIMA" evita que la proxima persona repita la busqueda,
 * y le dice a la asesora que esa afirmacion no se puede hacer.
 */
export async function researchProductGap(
  productId: string,
  gapIndex: number,
  options: GapResearchDependencies = {},
) {
  const { authorize, database, search, structure, now } = dependencies(options);
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

  const gap = product.verificationGaps[gapIndex];
  if (!gap) {
    return {
      ok: false as const,
      error: { code: "GAP_NOT_FOUND", message: "Ese dato pendiente no existe en la ficha." },
    };
  }

  const verifyPrompt = buildVerifyGapPrompt({
    product: {
      name: product.name,
      brand: product.brand,
      presentation: product.presentation,
      format: product.format,
      category: product.category,
    },
    gap,
  });
  const found = await search({
    advisorId: authorization.data.id,
    promptId: await activePromptId(database, "verify_gap"),
    system: verifyPrompt.system,
    messages: verifyPrompt.messages,
  });
  if (!found.ok) return found;

  const citations = await resolveCitations(found.data.citations, options.resolveCitation);
  const structurePrompt = buildStructureGapPrompt({
    gap,
    research: found.data.text,
    citations,
  });
  const structured = await structure({
    advisorId: authorization.data.id,
    purpose: "structure_gap",
    promptId: await activePromptId(database, "structure_gap"),
    schema: gapVerificationSchema,
    system: structurePrompt.system,
    messages: structurePrompt.messages,
    maxTokens: 2_500,
    // `low` es presupuesto de razonamiento cero, y aqui es lo correcto: la
    // investigacion ya esta escrita y esto solo la mete en cuatro campos.
    // Medido: con `high` el razonamiento consumio 1.984 de 2.000 tokens y la
    // respuesta llego cortada por max_tokens, sin un solo JSON valido.
    effort: "low",
  });
  if (!structured.ok) return structured;

  const verification = structured.data.value;
  // El hueco se reescribe con lo que se encontro y cuando. Sigue siendo un
  // hueco hasta que una persona mueva el dato a su campo: lo que cambia es que
  // ahora dice que se busco, donde, y que salio.
  const searchedIn =
    verification.searched_in.length > 0
      ? ` Revisado en: ${verification.searched_in.join(", ")}.`
      : "";
  const updatedGap = `${gap.replace(/\s*\|\s*BUSCADO .*$/u, "")} | BUSCADO ${stamp(now())} (${verification.outcome}): ${verification.finding}${searchedIn}`;

  const nextGaps = product.verificationGaps.map((item, index) =>
    index === gapIndex ? updatedGap : item,
  );
  const knownUrls = new Set(product.sources.map((source) => source.url).filter(Boolean));
  const nextSources = [
    ...product.sources,
    ...verification.sources
      .filter((source) => !knownUrls.has(source.url))
      .map((source) => ({
        label: source.label.slice(0, 200),
        url: source.url,
        note: `Abierta al investigar un dato pendiente el ${stamp(now())}; pendiente de revision humana.`,
      })),
  ];

  const parsed = productInputSchema.safeParse({
    ...product,
    sku: product.sku ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    verificationGaps: nextGaps,
    sources: nextSources,
    // El precio y el estado de verificacion no los toca una busqueda de un dato.
    priceCop: product.priceCop,
    verifiedAt: product.verifiedAt,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_GAP_RESULT",
        message: "El resultado no cumple el contrato de la ficha.",
      },
    };
  }

  try {
    const [updated] = await database
      .update(products)
      .set({ ...parsed.data, updatedAt: now() })
      .where(eq(products.id, product.id))
      .returning();
    if (!updated) throw new Error("No se actualizo la ficha.");
    return {
      ok: true as const,
      data: {
        outcome: verification.outcome,
        finding: verification.finding,
        sources: verification.sources.length,
        gap: updatedGap,
      },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar el dato investigado." },
    };
  }
}
