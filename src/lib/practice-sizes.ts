/**
 * Tamanos ofrecidos para una practica de categoria.
 *
 * Vive en `lib/` y no en `server/` porque el selector es un componente cliente:
 * importar el modulo de servidor desde el navegador arrastraria el cliente de
 * base de datos al bundle. La lista es la misma para los dos lados, y por eso
 * es una sola constante.
 */
export const PRACTICE_SIZES = [3, 6, 12, 18, 24] as const;

/** Tamano por defecto: media hora larga, corto para terminarlo antes de un live. */
export const DEFAULT_PRACTICE_SIZE = 12;
