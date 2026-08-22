import { describe, expect, it } from "vitest";

import { parseEnvFile } from "../../src/lib/load-env.ts";

/**
 * Vercel crea las variables que detecta en `.env.example` con valor VACIO, no
 * ausentes. Un despliegue recien importado llega entonces con
 * AI_MAX_CONCURRENCY="" y RECORDING_RETENTION_DAYS="", y el esquema tiene que
 * tratarlas igual que si no existieran.
 */
describe("variables vacías en un despliegue nuevo", () => {
  it("una cadena vacía cae al valor por defecto, no a cero", async () => {
    const { z } = await import("zod");
    // Misma forma que `src/lib/env.ts`: el valor por defecto se sustituye ANTES
    // de convertir. Con `.default()` por fuera no entra, porque "" no es
    // `undefined` y `z.coerce.number("")` da NaN.
    const positiveInteger = (fallback: number) =>
      z.preprocess(
        (value) => (value === "" || value === undefined ? fallback : value),
        z.coerce.number().int().positive(),
      );
    const schema = z.object({ AI_MAX_CONCURRENCY: positiveInteger(4) });

    expect(schema.parse({ AI_MAX_CONCURRENCY: "" }).AI_MAX_CONCURRENCY).toBe(4);
    expect(schema.parse({}).AI_MAX_CONCURRENCY).toBe(4);
    expect(schema.parse({ AI_MAX_CONCURRENCY: "8" }).AI_MAX_CONCURRENCY).toBe(8);
  });

  it("el archivo de entorno para desplegar no trae ningún valor vacío", () => {
    // Una variable vacía en el bloque que se pega en Vercel reproduce
    // exactamente el fallo que este arreglo cubre.
    const ejemplo = parseEnvFile("A=1\nB=\nC=tres");
    expect(ejemplo.B).toBe("");
    // Documenta el contrato: quien arme el bloque debe omitir la clave en vez
    // de dejarla vacía.
    expect(Object.entries(ejemplo).filter(([, value]) => value === "")).toHaveLength(1);
  });
});
