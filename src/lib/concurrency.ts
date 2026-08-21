/**
 * Recorre `items` con un maximo de `limit` tareas en vuelo, preservando el
 * orden del resultado.
 *
 * Existe porque `AI_MAX_CONCURRENCY` estaba declarado y sin usar: la cobertura
 * de chat es la primera funcion que dispara varias llamadas por una sola accion
 * de la asesora, y soltarlas todas a la vez contra un tier gratuito que ya
 * devuelve 503 con frecuencia cambiaria un problema de recall por uno de cuota.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
