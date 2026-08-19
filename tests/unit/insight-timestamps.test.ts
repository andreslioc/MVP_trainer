import { describe, expect, it } from "vitest";

import { sanitizeInsights } from "../../src/server/recordings/analyze.ts";

const allowed = new Set(["33333333-3333-4333-8333-333333333333"]);

describe("segundo del hallazgo", () => {
  it("conserva el segundo para poder ir a ese punto del video", () => {
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "riesgo_claim",
            text: "afirma que previene enfermedades",
            product_id: null,
            frequency: 1,
            at_seconds: 754,
          },
        ],
      },
      allowed,
    );

    expect(result.kept[0]?.atSeconds).toBe(754);
  });

  it("acepta que no lo haya: una transcripción pegada a mano puede no traer marcas", () => {
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "faq",
            text: "preguntan por el sabor",
            product_id: null,
            frequency: 1,
            at_seconds: null,
          },
        ],
      },
      allowed,
    );

    expect(result.kept[0]?.atSeconds).toBeNull();
  });

  it("el segundo sobrevive a la redacción de datos personales del texto", () => {
    // Redactar cambia el texto; perder el segundo por eso dejaria el hallazgo
    // sin el dato que lo hace accionable.
    const result = sanitizeInsights(
      {
        insights: [
          {
            type: "oportunidad",
            text: "invita a escribir al 3001234567 sin ofrecer el CTA",
            product_id: null,
            frequency: 1,
            at_seconds: 91,
          },
        ],
      },
      allowed,
    );

    expect(result.redacted).toBe(1);
    expect(result.kept[0]?.atSeconds).toBe(91);
  });
});
