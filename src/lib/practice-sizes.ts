import { z } from "zod";

/**
 * Tamanos ofrecidos para una practica, sea por categoria o por ficha.
 *
 * Vive en `lib/` y no en `server/` porque el selector es un componente cliente:
 * importar el modulo de servidor desde el navegador arrastraria el cliente de
 * base de datos al bundle. La lista es la misma para los dos lados, y por eso
 * es una sola constante.
 */
export const PRACTICE_SIZES = [3, 6, 12, 18, 24] as const;

/** Tamano por defecto: media hora larga, corto para terminarlo antes de un live. */
export const DEFAULT_PRACTICE_SIZE = 12;

/**
 * Lista cerrada y no un numero libre: el tamano se guarda en la sesion y entra
 * en un check de la base, asi que un 500 escrito a mano en la peticion tiene que
 * morir en el borde y no en Postgres.
 */
export const practiceSizeSchema = z.union(PRACTICE_SIZES.map((size) => z.literal(size)));
