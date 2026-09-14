import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  estaVerificada,
  hayExistencias,
  sePuedePracticar,
} from "../../src/db/product-visibility.ts";
import { products } from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

/**
 * Que ficha se puede ofrecer en vivo.
 *
 * Son dos condiciones separadas —contenido revisado y existencias— y estuvieron
 * mezcladas en `verified_at`. Esta prueba fija la semantica que hace que la
 * separacion sea segura: NULL en `stock_units` significa "sin dato", no "cero".
 */

const connection = openDirectDatabase("test");

const SIN_DATO = randomUUID();
const AGOTADA = randomUUID();
const CON_STOCK = randomUUID();
const SIN_VERIFICAR = randomUUID();
const TODAS = [SIN_DATO, AGOTADA, CON_STOCK, SIN_VERIFICAR];

const ficha = (id: string, sufijo: string, extra: Record<string, unknown>) => ({
  ...productInputSchema.parse(validProductInput()),
  id,
  sku: `VIS-${sufijo}`,
  // El indice (marca, nombre, presentacion) es unico: cada fila necesita su
  // propia presentacion.
  presentation: `Frasco de prueba ${sufijo}`,
  priceCop: 50000,
  ...extra,
});

beforeAll(async () => {
  await connection.db
    .insert(products)
    .values([
      ficha(SIN_DATO, "sin-dato", { verifiedAt: new Date(), stockUnits: null }),
      ficha(AGOTADA, "agotada", { verifiedAt: new Date(), stockUnits: 0 }),
      ficha(CON_STOCK, "con-stock", { verifiedAt: new Date(), stockUnits: 7 }),
      ficha(SIN_VERIFICAR, "sin-verif", { verifiedAt: null, stockUnits: 7 }),
    ]);
});

afterAll(async () => {
  await connection.db.delete(products).where(inArray(products.id, TODAS));
  await connection.close();
});

const idsQueCumplen = async (condicion: ReturnType<typeof sePuedePracticar>) => {
  const filas = await connection.db.select({ id: products.id }).from(products).where(condicion);
  return new Set(filas.map((f) => f.id));
};

describe("hayExistencias", () => {
  it("la ficha SIN dato de inventario sigue visible", async () => {
    // El fallo que evita: la columna se desplego vacia sobre las 154 fichas del
    // catalogo. Si NULL contara como agotado, el Copilot se habria quedado sin
    // catalogo de un golpe.
    const visibles = await idsQueCumplen(hayExistencias());
    expect(visibles.has(SIN_DATO)).toBe(true);
  });

  it("solo un cero explicito esconde", async () => {
    const visibles = await idsQueCumplen(hayExistencias());
    expect(visibles.has(AGOTADA)).toBe(false);
    expect(visibles.has(CON_STOCK)).toBe(true);
  });
});

describe("sePuedePracticar", () => {
  it("pide las dos cosas: contenido revisado Y existencias", async () => {
    const ofrecibles = await idsQueCumplen(sePuedePracticar());
    expect(ofrecibles.has(CON_STOCK)).toBe(true);
    // Agotada pero con el contenido revisado: no se ofrece.
    expect(ofrecibles.has(AGOTADA)).toBe(false);
    // Con mercancia pero sin revisar: tampoco.
    expect(ofrecibles.has(SIN_VERIFICAR)).toBe(false);
  });

  it("la ficha agotada SI se puede leer, aunque no se pueda practicar", async () => {
    // Es lo que pidio Haider: el stock saca del Training, no esconde la ficha.
    // Si una clienta pregunta en vivo por algo agotado, la asesora necesita la
    // ficha delante para responder "ahora no tenemos".
    const visibles = await idsQueCumplen(estaVerificada());
    expect(visibles.has(AGOTADA)).toBe(true);
    const practicables = await idsQueCumplen(sePuedePracticar());
    expect(practicables.has(AGOTADA)).toBe(false);
  });

  it("una ficha agotada CONSERVA su verificacion", async () => {
    // Es la razon de ser de la columna: antes, desactivar por falta de
    // mercancia borraba el registro de que el contenido estaba revisado, y al
    // reponer habia que acordarse una por una de cuales bajar de nuevo.
    const [fila] = await connection.db
      .select({ verifiedAt: products.verifiedAt, stockUnits: products.stockUnits })
      .from(products)
      .where(eq(products.id, AGOTADA));
    expect(fila?.verifiedAt).not.toBeNull();
    expect(fila?.stockUnits).toBe(0);
  });
});
