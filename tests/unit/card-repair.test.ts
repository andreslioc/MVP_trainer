import { describe, expect, it, vi } from "vitest";

import type { RepairedCard } from "../../src/lib/ai/schemas.ts";
import { applyRepair, isRepairable } from "../../src/lib/repair-patch.ts";
import { repairUntilValid } from "../../src/server/card-repair.ts";
import { validProductInput } from "../fixtures/product.ts";

function reparador(...respuestas: RepairedCard[]) {
  const cola = [...respuestas];
  return vi.fn(async () => {
    const value = cola.shift();
    if (!value) {
      return {
        ok: false as const,
        error: { code: "AI_INVALID_OUTPUT" as const, message: "sin respuesta" },
      };
    }
    return { ok: true as const, data: { value, usage: null } } as never;
  });
}

const base = validProductInput();

describe("el error del gate vuelve al modelo", () => {
  it("arregla la palabra que no se dice en camara y la ficha pasa", async () => {
    // Caso real: dos corridas seguidas escribieron "vehiculo" en la descripcion.
    const patch = { description: "Extracto con aceite de oliva como vehiculo." };
    const repair = reparador({
      description: "Extracto mezclado con aceite de oliva, que es el aceite con el que viene.",
    });
    const result = await repairUntilValid({
      patch,
      base: {
        ...base,
        precautions: "Lleva aceite de oliva: quien sea alérgico al olivo no debe usarlo.",
        contraindications: ["Alergia al olivo"],
      },
      advisorId: "a",
      promptId: null,
      repair,
    });
    expect(result.parsed.success).toBe(true);
    expect(result.rounds).toBe(1);
    expect(repair).toHaveBeenCalledOnce();
  });

  it("para a las dos rondas y no sigue gastando", async () => {
    const repair = reparador(
      { description: "Sigue con vehiculo dentro." },
      { description: "Y otra vez vehiculo." },
    );
    const result = await repairUntilValid({
      patch: { description: "Aceite de oliva como vehiculo." },
      base,
      advisorId: "a",
      promptId: null,
      repair,
    });
    expect(result.parsed.success).toBe(false);
    expect(result.rounds).toBe(2);
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it("no llama al modelo cuando la ficha ya pasa", async () => {
    const repair = reparador();
    const result = await repairUntilValid({
      patch: {},
      base,
      advisorId: "a",
      promptId: null,
      repair,
    });
    expect(result.parsed.success).toBe(true);
    expect(repair).not.toHaveBeenCalled();
  });

  it("corta cuando la correccion no cambio nada", async () => {
    const repair = reparador({ description: "Aceite de oliva como vehiculo." });
    const result = await repairUntilValid({
      patch: { description: "Aceite de oliva como vehiculo." },
      base,
      advisorId: "a",
      promptId: null,
      repair,
    });
    expect(repair).toHaveBeenCalledOnce();
    expect(result.parsed.success).toBe(false);
  });

  it("no manda a reparar un campo que el reparador no puede tocar", async () => {
    const repair = reparador();
    const result = await repairUntilValid({
      patch: { sources: [{ label: "" }] },
      base,
      advisorId: "a",
      promptId: null,
      repair,
    });
    expect(repair).not.toHaveBeenCalled();
    expect(result.rounds).toBe(0);
  });
});

describe("aplicar la correccion no borra lo que estaba", () => {
  it("solo copia las claves devueltas", () => {
    const patch = { description: "vieja", purpose: "intacto", benefits: [1] };
    expect(applyRepair(patch, { description: "nueva" })).toEqual({
      description: "nueva",
      purpose: "intacto",
      benefits: [1],
    });
  });

  it("ignora un arreglo vacio: eso es una perdida, no una correccion", () => {
    // Un modelo que "arregla" los casos de no uso borrandolos deja la ficha sin
    // advertencias, y la ficha sin advertencias si pasa el gate.
    const patch = { contraindications: ["Embarazo", "Lactancia"] };
    expect(applyRepair(patch, { contraindications: [] })).toEqual(patch);
  });

  it("ignora un texto vacio", () => {
    expect(applyRepair({ purpose: "algo" }, { purpose: "   " })).toEqual({ purpose: "algo" });
  });

  it("traduce el nombre del campo al de la ficha", () => {
    expect(applyRepair({}, { usage_mode: "4 gotas en agua", live_ready: ["frase"] })).toEqual({
      usageMode: "4 gotas en agua",
      liveReady: ["frase"],
    });
  });

  it("reconoce que campos se pueden reparar", () => {
    expect(isRepairable(["description", "liveReady.2", "benefits.0.claim"])).toBe(true);
    expect(isRepairable(["sources", "description"])).toBe(false);
  });

  it("puede reparar los campos de camara que antes se perdian", () => {
    // Una ficha entera se perdio por la palabra "via oral" en la evidencia de
    // un diferencial: el reparador la veia y no podia tocarla.
    expect(
      isRepairable([
        "differentiators.2.evidence",
        "faqs.1.answer",
        "objections.0.response",
        "vsSimilares.0.difference",
      ]),
    ).toBe(true);
  });
});
