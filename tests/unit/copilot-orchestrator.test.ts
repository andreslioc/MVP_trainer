import { describe, expect, it } from "vitest";

import {
  availableCtasFromRules,
  orchestrateCopilot,
  type CommercialRule,
} from "../../src/server/copilot/orchestrator.ts";

const activeRules: CommercialRule[] = [
  { key: "canal_whatsapp", value: { cta: "Escríbenos por WhatsApp" }, active: true },
  { key: "seguir_tiktok", value: { cta: "Sigue nuestra cuenta" }, active: true },
  { key: "envio_gratis", value: { threshold_cop: 120_000 }, active: true },
  { key: "promo_live", value: { message: "Promoción inactiva" }, active: false },
];

describe("Copilot commercial orchestrator", () => {
  it("rotates away from the immediately previous CTA when an alternative exists", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(activeRules),
      rules: activeRules,
      ctasUsed: [{ cta: "Escríbenos por WhatsApp", at: "2026-08-18T12:00:00Z" }],
      promosMentioned: [],
    });

    expect(result.cta).toEqual({ text: "Sigue nuestra cuenta", ruleKey: "seguir_tiktok" });
  });

  it("repeats the only valid CTA and never creates a replacement", () => {
    const oneRule = activeRules.filter((rule) => rule.key === "canal_whatsapp");
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(oneRule),
      rules: oneRule,
      ctasUsed: [{ cta: "Escríbenos por WhatsApp", at: "2026-08-18T12:00:00Z" }],
      promosMentioned: [],
    });

    expect(result.cta?.text).toBe("Escríbenos por WhatsApp");
    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("returns at most one CTA and one active incentive", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(activeRules),
      rules: activeRules,
      ctasUsed: [],
      promosMentioned: [],
    });

    expect(result.cta).toEqual({ text: "Escríbenos por WhatsApp", ruleKey: "canal_whatsapp" });
    expect(result.incentive).toEqual({
      ruleKey: "envio_gratis",
      value: { threshold_cop: 120_000 },
    });
    expect(result.incentive?.ruleKey).not.toBe("promo_live");
  });

  it("rotates an incentive when another active option exists", () => {
    const rules = activeRules.map((rule) =>
      rule.key === "promo_live" ? { ...rule, active: true } : rule,
    );
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(rules),
      rules,
      ctasUsed: [],
      promosMentioned: [{ rule_key: "envio_gratis", at: "2026-08-18T12:00:00Z" }],
    });

    expect(result.incentive?.ruleKey).toBe("promo_live");
  });

  it("deja el CTA de último recurso fuera de la rotación cuando hay otro", () => {
    const result = orchestrateCopilot({
      availableCtas: [
        { text: "Sigue la cuenta para ver los proximos lives", ruleKey: "seguir_tiktok" },
        { text: "Escríbenos y te lo apartamos", ruleKey: "canal_whatsapp" },
      ],
      rules: [
        { key: "seguir_tiktok", value: { last_resort: true }, active: true },
        { key: "canal_whatsapp", value: { closes_sale: true }, active: true },
      ],
      ctasUsed: [],
      promosMentioned: [],
      intent: "informacion",
    });
    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("usa el de último recurso cuando es el único que queda", () => {
    const result = orchestrateCopilot({
      availableCtas: [
        { text: "Sigue la cuenta para ver los proximos lives", ruleKey: "seguir_tiktok" },
      ],
      rules: [{ key: "seguir_tiktok", value: { last_resort: true }, active: true }],
      ctasUsed: [],
      promosMentioned: [],
      intent: "informacion",
    });
    expect(result.cta?.ruleKey).toBe("seguir_tiktok");
  });

  it("returns null instead of inventing a CTA or promotion", () => {
    const result = orchestrateCopilot({
      availableCtas: [{ text: "CTA de regla apagada", ruleKey: "apagada" }],
      rules: [{ key: "apagada", value: { cta: "CTA de regla apagada" }, active: false }],
      ctasUsed: [],
      promosMentioned: [],
    });

    expect(result).toEqual({ cta: null, incentive: null, ruleApplied: null });
  });
});

describe("CTA segun la intencion de la pregunta", () => {
  const rules = [
    {
      key: "canal_whatsapp",
      value: {
        cta: "Escríbenos al número que ves en pantalla y te apartamos el tuyo",
        closes_sale: true,
      },
      active: true,
    },
    {
      key: "seguir_tiktok",
      value: { cta: "Sigue la cuenta para ver los proximos lives" },
      active: true,
    },
  ];
  const availableCtas = availableCtasFromRules(rules);

  it("con pregunta de precio elige el CTA que cierra venta", () => {
    // Caso real: se respondio "sigue la cuenta" a un "cuanto cuesta", porque la
    // rotacion no miraba la intencion.
    const result = orchestrateCopilot({
      availableCtas,
      rules,
      ctasUsed: [],
      promosMentioned: [],
      intent: "precio",
    });

    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("no rota el CTA de cierre aunque acabe de usarse", () => {
    // Dos clientas seguidas preguntando el precio deben recibir las dos la
    // invitacion a apartar. Repetir aqui es correcto.
    const result = orchestrateCopilot({
      availableCtas,
      rules,
      ctasUsed: [
        {
          cta: "Escríbenos al número que ves en pantalla y te apartamos el tuyo",
          at: "2026-08-20T12:00:00.000Z",
        },
      ],
      promosMentioned: [],
      intent: "precio",
    });

    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("con intencion de compra tambien cierra", () => {
    const result = orchestrateCopilot({
      availableCtas,
      rules,
      ctasUsed: [],
      promosMentioned: [],
      intent: "compra",
    });

    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("en las demas intenciones sigue rotando para no repetirse", () => {
    const result = orchestrateCopilot({
      availableCtas,
      rules,
      ctasUsed: [
        {
          cta: "Escríbenos al número que ves en pantalla y te apartamos el tuyo",
          at: "2026-08-20T12:00:00.000Z",
        },
      ],
      promosMentioned: [],
      intent: "uso",
    });

    expect(result.cta?.ruleKey).toBe("seguir_tiktok");
  });

  it("sin ningun CTA marcado como de cierre, rota como siempre", () => {
    const sinCierre = rules.map((rule) => ({
      ...rule,
      value: { cta: (rule.value as { cta: string }).cta },
    }));
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(sinCierre),
      rules: sinCierre,
      ctasUsed: [],
      promosMentioned: [],
      intent: "precio",
    });

    expect(result.cta).not.toBeNull();
  });
});

describe("incentivo segun la intencion de la pregunta", () => {
  const rules: CommercialRule[] = [
    { key: "envio_gratis", value: { threshold_cop: 120_000 }, active: true },
    { key: "promo_live", value: { message: "Promoción del live" }, active: true },
    {
      key: "canal_whatsapp",
      value: { cta: "Escríbenos al número que ves en pantalla", closes_sale: true },
      active: true,
    },
  ];

  it("con pregunta de precio siempre sale el envio gratis por monto", () => {
    // Es el unico incentivo que se puede decir pegado al precio: la clienta
    // acaba de escuchar el numero y ya sabe si pasa el umbral. La rotacion lo
    // cambiaba por la promo del live y la respuesta de precio quedaba sin nada.
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(rules),
      rules,
      ctasUsed: [],
      promosMentioned: [{ rule_key: "envio_gratis", at: "2026-08-18T12:00:00Z" }],
      intent: "precio",
    });

    expect(result.incentive?.ruleKey).toBe("envio_gratis");
    expect(result.ruleApplied).toBe("envio_gratis");
  });

  it("con intencion de compra tampoco rota", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(rules),
      rules,
      ctasUsed: [],
      promosMentioned: [{ rule_key: "envio_gratis", at: "2026-08-18T12:00:00Z" }],
      intent: "compra",
    });

    expect(result.incentive?.ruleKey).toBe("envio_gratis");
  });

  it("en las demas intenciones sigue rotando para no repetirse", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(rules),
      rules,
      ctasUsed: [],
      promosMentioned: [{ rule_key: "envio_gratis", at: "2026-08-18T12:00:00Z" }],
      intent: "uso",
    });

    expect(result.incentive?.ruleKey).toBe("promo_live");
  });

  it("sin incentivo con umbral activo no se inventa uno", () => {
    const sinUmbral = rules.filter((rule) => rule.key !== "envio_gratis");
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(sinUmbral),
      rules: sinUmbral,
      ctasUsed: [],
      promosMentioned: [],
      intent: "precio",
    });

    expect(result.incentive?.ruleKey).toBe("promo_live");
  });
});
