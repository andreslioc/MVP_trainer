import { describe, expect, it } from "vitest";

import type { products } from "../../src/db/schema.ts";
import {
  buildGenerateQuestionsPrompt,
  productKnowledgeForPrompt,
} from "../../src/lib/ai/prompts/generate-questions.ts";
import type { GeneratedQuestions } from "../../src/lib/ai/schemas.ts";
import { validateGeneratedQuestionBatch } from "../../src/server/training/questions.ts";
import { validProductInput } from "../fixtures/product.ts";

type Product = typeof products.$inferSelect;

function product(): Product {
  const input = validProductInput({
    name: "Magnesio verificado",
    verifiedAt: new Date("2026-08-18T12:00:00Z"),
  });
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ...input,
    verifiedAt: input.verifiedAt ?? null,
    createdAt: new Date("2026-08-18T12:00:00Z"),
    updatedAt: new Date("2026-08-18T12:00:00Z"),
  } as Product;
}

function validBatch(): GeneratedQuestions {
  return {
    questions: [
      {
        text: "¿Que ingrediente contiene?",
        intent: "informacion",
        difficulty: "basica",
        ideal_answer: "Contiene magnesio según la etiqueta del producto.",
        criteria: ["Nombra el magnesio"],
      },
      {
        text: "¿Cuantas capsulas trae?",
        intent: "uso",
        difficulty: "basica",
        ideal_answer: "La presentación verificada contiene 60 cápsulas.",
        criteria: ["Menciona la presentación"],
      },
      {
        text: "¿Como encaja en mi rutina?",
        intent: "uso",
        difficulty: "intermedia",
        ideal_answer: "La ficha describe un formato práctico para integrar a la rutina.",
        criteria: ["Se limita a la ficha"],
      },
      {
        text: "¿Que diferencia tiene?",
        intent: "comparacion",
        difficulty: "intermedia",
        ideal_answer: "La etiqueta clara es el diferenciador verificable registrado.",
        criteria: ["No inventa comparaciones"],
      },
      {
        text: "¿Puedo tomarlo con medicamentos?",
        intent: "seguridad",
        difficulty: "dificil",
        ideal_answer: "Si usas medicamentos, consulta a un profesional antes de usarlo.",
        criteria: ["Activa la cautela"],
      },
      {
        text: "¿Me garantiza resultados?",
        intent: "objecion",
        difficulty: "dificil",
        ideal_answer:
          "El magnesio no garantiza resultados individuales; la etiqueta declara la porción y el aporte.",
        criteria: ["Declara el límite"],
      },
    ],
  };
}

describe("question generation", () => {
  it("renders only the selected product knowledge into the prompt", () => {
    const selected = product();
    const rendered = buildGenerateQuestionsPrompt(selected);

    // El registro es parte del contrato del prompt: sin esta regla el modelo
    // escribe "¿me pueden confirmar la certificacion?", que ninguna clienta
    // teclea en el chat de un live.
    expect(rendered.system).toContain("me pueden confirmar");
    expect(rendered.system).toContain("maximo doce");
    expect(rendered.system).toContain("Magnesio verificado");
    expect(rendered.system).toContain("Complementa la ingesta de magnesio");
    expect(rendered.system).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(Object.keys(productKnowledgeForPrompt(selected))).not.toContain("createdAt");
  });

  it("accepts six questions balanced across difficulty and intent", () => {
    const result = validateGeneratedQuestionBatch(validBatch(), product());

    expect(result.ok).toBe(true);
  });

  it("rejects the complete batch when an answer invents a claim", () => {
    const batch = validBatch();
    batch.questions[0] = {
      ...batch.questions[0],
      ideal_answer: "Este producto cura la diabetes.",
    };

    const result = validateGeneratedQuestionBatch(batch, product());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_GENERATED_QUESTIONS" },
    });
    // El mensaje nombra cual de las seis fallo: sin eso, diagnosticar una tanda
    // rechazada obliga a reproducir la generacion entera.
    if (result.ok) return;
    expect(result.error.message).toContain("pregunta 1");
    expect(result.error.message).toContain(batch.questions[0]?.text ?? "");
  });

  it("accepts an answer that denies a forbidden claim", () => {
    const batch = validBatch();
    batch.questions[4] = {
      ...batch.questions[4],
      ideal_answer:
        "No, es un suplemento dietario y bajo ninguna circunstancia debe considerarse que cura, trata o previene enfermedades.",
    };

    expect(validateGeneratedQuestionBatch(batch, product()).ok).toBe(true);
  });

  it("still rejects the forbidden claim when the denial is a separate sentence", () => {
    const batch = validBatch();
    batch.questions[4] = {
      ...batch.questions[4],
      ideal_answer: "No reemplaza una dieta equilibrada. Cura enfermedades del higado.",
    };

    expect(validateGeneratedQuestionBatch(batch, product())).toMatchObject({
      ok: false,
      error: { code: "INVALID_GENERATED_QUESTIONS" },
    });
  });

  it("rechaza la respuesta ideal que se escapa por la cautela", () => {
    const batch = validBatch();
    batch.questions[0] = {
      ...(batch.questions[0] as GeneratedQuestions["questions"][number]),
      ideal_answer: "Revisa la etiqueta.",
    };

    const result = validateGeneratedQuestionBatch(batch, product());

    // La ficha SI trae el ingrediente y la porcion: mandar a la etiqueta es una
    // salida, y practicarla ensena a decirla en camara.
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_GENERATED_QUESTIONS" } });
    if (result.ok) return;
    expect(result.error.message).toContain("se escapa por la cautela");
  });

  it("acepta la cautela cuando viene con lo que si dice la ficha", () => {
    const batch = validBatch();
    batch.questions[0] = {
      ...(batch.questions[0] as GeneratedQuestions["questions"][number]),
      ideal_answer:
        "El magnesio aporta el mineral que declara la etiqueta; si tomas medicamentos, consulta a un profesional.",
    };

    expect(validateGeneratedQuestionBatch(batch, product()).ok).toBe(true);
  });

  it("rejects a batch without two questions per difficulty", () => {
    const batch = validBatch();
    batch.questions[0] = { ...batch.questions[0], difficulty: "dificil" };

    expect(validateGeneratedQuestionBatch(batch, product())).toMatchObject({
      ok: false,
      error: { code: "INVALID_GENERATED_QUESTIONS" },
    });
  });
});
