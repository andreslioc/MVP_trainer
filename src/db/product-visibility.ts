/**
 * Que ficha entra a cada modulo.
 *
 * Son dos condiciones independientes y hay que combinarlas distinto segun lo
 * que se vaya a hacer:
 *
 * 1. `verified_at` — el contenido se reviso contra la etiqueta. Sin eso la
 *    ficha no puede afirmar nada, y eso no se negocia en ningun modulo.
 * 2. `stock_units` — hay unidades. Solo importa cuando se va a EMPEZAR algo:
 *    no tiene sentido practicar la venta de algo que no se puede vender.
 *
 * La asesora SI puede ver y consultar una ficha agotada: si una clienta
 * pregunta por ella en vivo, necesita poder responder "ahora no tenemos" con
 * los datos delante, no quedarse sin ficha.
 */

import { type SQL, and, gt, isNotNull, isNull, or } from "drizzle-orm";

import { products } from "./schema.ts";

/**
 * NULL en `stock_units` significa "sin dato", no "cero".
 *
 * Por eso la ficha sin inventario cargado SE MUESTRA: la columna se desplego
 * vacia sobre un catalogo entero, y tratar el vacio como agotado habria borrado
 * el catalogo de un golpe. Solo un cero explicito esconde.
 */
export function hayExistencias(): SQL {
  return or(isNull(products.stockUnits), gt(products.stockUnits, 0)) as SQL;
}

/**
 * El contenido esta revisado. El piso de todos los modulos.
 *
 * Es lo que se usa para LEER: el selector del Copilot, el catalogo del
 * analizador de transcripciones, y —critico— las consultas que abren una
 * practica ya empezada. Si una ficha se agota a mitad de practica, sus
 * preguntas no pueden desaparecer de la tanda: el resumen mostraria un conjunto
 * distinto del que se respondio.
 */
export function estaVerificada(): SQL {
  return isNotNull(products.verifiedAt);
}

/**
 * Revisada Y con existencias: lo que se puede EMPEZAR a practicar.
 *
 * Solo para elegir con que arrancar —la lista de categorias, el selector de
 * ficha, el simulacro, la generacion de preguntas—. Nunca para leer una
 * practica en curso ni para evaluar una respuesta ya dada.
 */
export function sePuedePracticar(): SQL {
  return and(estaVerificada(), hayExistencias()) as SQL;
}
