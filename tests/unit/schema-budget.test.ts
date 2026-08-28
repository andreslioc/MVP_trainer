import { describe, expect, it } from "vitest";
import { z } from "zod";

import { researchedProductSchema, safetyLayerSchema } from "../../src/lib/ai/schemas.ts";

/**
 * El esquema de respuesta del proveedor tiene un techo, y no avisa antes de
 * chocarlo: contesta 400 INVALID_ARGUMENT y ninguna ficha se escribe.
 *
 * Medido contra el REST el 28-ago-2026 con `researched_product`: con 11 arreglos
 * el contrato era rechazado, y quitar CUALQUIERA de ellos —incluso uno viejo—
 * lo hacia pasar. No es un campo concreto: es el tamaño.
 *
 * Esta prueba no llama al proveedor. Fija el presupuesto medido para que el
 * proximo campo se agregue sabiendo cuanto margen queda, en vez de descubrirlo
 * con las fichas sin escribir.
 */
function countArrays(node: unknown): number {
  if (typeof node !== "object" || node === null) return 0;
  const record = node as Record<string, unknown>;
  const self = record.type === "array" ? 1 : 0;
  return Object.values(record).reduce<number>((total, value) => total + countArrays(value), self);
}

describe("presupuesto del esquema de respuesta", () => {
  it("mantiene la investigacion por debajo del techo del proveedor", () => {
    const jsonSchema = z.toJSONSchema(researchedProductSchema);
    // 11 arreglos fue rechazado. 10 pasa. El margen es de uno: al agregar otro
    // hay que quitar uno, o partir la llamada en dos.
    expect(countArrays(jsonSchema)).toBeLessThanOrEqual(10);
  });

  it("mantiene la capa de seguridad holgada", () => {
    const jsonSchema = z.toJSONSchema(safetyLayerSchema);
    expect(countArrays(jsonSchema)).toBeLessThanOrEqual(10);
  });
});
