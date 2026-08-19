import { describe, expect, it } from "vitest";

import {
  ANALYZE_TRANSCRIPT_PROMPT,
  buildAnalyzeTranscriptPrompt,
  containsPii,
  redactPii,
  REDACTION_TOKENS,
} from "../../src/lib/ai/prompts/analyze-transcript.ts";
import { isPromotable } from "../../src/lib/insights.ts";
import { sanitizeInsights } from "../../src/server/recordings/analyze.ts";

describe("redactPii", () => {
  it("redacta moviles colombianos con y sin indicativo", () => {
    expect(redactPii("escribeme al 3001234567")).toBe(`escribeme al ${REDACTION_TOKENS.phone}`);
    expect(redactPii("mi celular es +57 300 123 4567")).toBe(
      `mi celular es ${REDACTION_TOKENS.phone}`,
    );
    expect(redactPii("llamame al 2 345678")).toBe(`llamame al ${REDACTION_TOKENS.phone}`);
  });

  it("no confunde un precio con un telefono", () => {
    expect(redactPii("el envio gratuito arranca en 120000 pesos")).toBe(
      "el envio gratuito arranca en 120000 pesos",
    );
    expect(redactPii("cuesta 1200000 pesos")).toBe("cuesta 1200000 pesos");
  });

  it("redacta correos", () => {
    expect(redactPii("mandalo a Ana.Lopez+live@correo.com")).toBe(
      `mandalo a ${REDACTION_TOKENS.email}`,
    );
  });

  it("redacta nombres en presentaciones y vocativos", () => {
    expect(redactPii("hola, me llamo Carolina Restrepo")).toBe(
      `hola, me llamo ${REDACTION_TOKENS.name}`,
    );
    expect(redactPii("gracias Marcela por la compra")).toBe(
      `gracias ${REDACTION_TOKENS.name} por la compra`,
    );
    expect(redactPii("señora Beatriz, ya le respondo")).toBe(
      `señora ${REDACTION_TOKENS.name}, ya le respondo`,
    );
  });

  it("no borra nombres de producto en mayuscula", () => {
    const text = "el Colageno Hidrolizado es para cabello y unas";
    expect(redactPii(text)).toBe(text);
  });

  it("es idempotente", () => {
    const once = redactPii("me llamo Andrea y mi numero es 3159876543");
    expect(redactPii(once)).toBe(once);
  });
});

describe("containsPii", () => {
  it("distingue texto limpio de texto con identificadores", () => {
    expect(containsPii("las clientas preguntan por la dosis diaria")).toBe(false);
    expect(containsPii("escribir al 3001234567")).toBe(true);
  });
});

describe("buildAnalyzeTranscriptPrompt", () => {
  it("redacta la transcripcion antes de que el modelo la vea", () => {
    const built = buildAnalyzeTranscriptPrompt({
      transcript: "[Speaker 0] hola, me llamo Paula y mi numero es 3001234567",
      durationS: 3600,
      products: [{ id: "11111111-1111-4111-8111-111111111111", name: "Colageno" }],
    });
    const body = built.messages[0]?.content ?? "";
    expect(body).not.toContain("Paula");
    expect(body).not.toContain("3001234567");
    expect(body).toContain(REDACTION_TOKENS.name);
    expect(body).toContain(REDACTION_TOKENS.phone);
    expect(body).toContain("DURACION_SEGUNDOS: 3600");
  });

  it("entrega el catalogo permitido y las reglas del sistema", () => {
    const built = buildAnalyzeTranscriptPrompt({
      transcript: "sin datos personales",
      durationS: null,
      products: [{ id: "22222222-2222-4222-8222-222222222222", name: "Biotina" }],
    });
    expect(built.system).toContain(ANALYZE_TRANSCRIPT_PROMPT);
    expect(built.system).toContain("22222222-2222-4222-8222-222222222222");
    expect(built.messages[0]?.content).toContain("DURACION_SEGUNDOS: desconocida");
  });
});

describe("sanitizeInsights", () => {
  const allowed = new Set(["33333333-3333-4333-8333-333333333333"]);

  it("redacta identificadores sin perder el hallazgo, y los cuenta", () => {
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "faq",
            text: "preguntan por la dosis",
            product_id: null,
            frequency: 3,
            at_seconds: null,
          },
          {
            type: "objecion",
            text: "escribir al 3001234567",
            product_id: null,
            frequency: 1,
            at_seconds: null,
          },
        ],
      },
      allowed,
    );
    expect(result.kept).toHaveLength(2);
    expect(result.redacted).toBe(1);
    expect(result.discarded).toBe(0);
    expect(result.kept[1]?.text).toBe(`escribir al ${REDACTION_TOKENS.phone}`);
    expect(result.kept.every((insight) => !containsPii(insight.text))).toBe(true);
  });

  it("descarta un insight que despues de redactar no dice nada", () => {
    const result = sanitizeInsights(
      {
        insights: [
          { type: "faq", text: "3001234567", product_id: null, frequency: 1, at_seconds: null },
        ],
      },
      allowed,
    );
    expect(result.kept).toHaveLength(0);
    expect(result.discarded).toBe(1);
    expect(result.redacted).toBe(1);
  });

  it("descarta un product_id que no esta en el catalogo permitido", () => {
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "faq",
            text: "preguntan si es original",
            product_id: "44444444-4444-4444-8444-444444444444",
            frequency: 2,
            at_seconds: null,
          },
        ],
      },
      allowed,
    );
    expect(result.kept[0]?.productId).toBeNull();
  });

  it("conserva un product_id valido", () => {
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "faq",
            text: "preguntan por el sabor",
            product_id: "33333333-3333-4333-8333-333333333333",
            frequency: 1,
            at_seconds: null,
          },
        ],
      },
      allowed,
    );
    expect(result.kept[0]?.productId).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("isPromotable", () => {
  it("solo promueve preguntas y objeciones con producto", () => {
    const productId = "55555555-5555-4555-8555-555555555555";
    expect(isPromotable({ type: "faq", productId })).toBe(true);
    expect(isPromotable({ type: "objecion", productId })).toBe(true);
    expect(isPromotable({ type: "faq", productId: null })).toBe(false);
    expect(isPromotable({ type: "error", productId })).toBe(false);
    expect(isPromotable({ type: "riesgo_claim", productId })).toBe(false);
  });
});
