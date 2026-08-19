/**
 * Registro de fallos del servidor.
 *
 * Existe porque un `catch` que descarta la causa convierte cualquier fallo en el
 * mismo mensaje opaco y deja la unica pista posible en la basura. Depurar una
 * subida rota costo tres teorias equivocadas justo por eso: el usuario leia "No
 * se pudo procesar la grabación" tanto si faltaba una columna en la base como si
 * Node rechazaba el `this` de un Blob.
 *
 * Lo que ve el usuario sigue siendo generico —el detalle no le sirve y puede
 * filtrar rutas o credenciales—, pero el servidor tiene que poder decir que paso.
 */
export function logFailure(scope: string, error: unknown) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[${scope}] ${detail}`);
}
