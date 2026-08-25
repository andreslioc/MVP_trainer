import type { ResearchCitation } from "./research-patch.ts";

/**
 * Convierte las fuentes del buscador en URLs que una persona pueda abrir.
 *
 * El proveedor no devuelve la pagina: devuelve un redirect suyo
 * (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`) y como titulo
 * solo el dominio. Guardar eso en la ficha es guardar un enlace opaco que
 * caduca — y una fuente que manana no abre no es una fuente verificable.
 *
 * Se sigue el redirect una vez para quedarse con la URL final. Si no responde,
 * se conserva la del proveedor: es peor perder la fuente que guardarla fea.
 */

const RESOLVE_TIMEOUT_MS = 8_000;

export type CitationFetch = (url: string) => Promise<{ url: string }>;

const defaultFetch: CitationFetch = async (url) => {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });
  return { url: response.url };
};

/**
 * Etiqueta legible de una fuente: dominio y, si hace falta, la ultima parte de
 * la ruta.
 *
 * El proveedor da como titulo solo el dominio, asi que dos paginas del mismo
 * sitio llegaban con la misma etiqueta —y React las veia como la misma fila—.
 * Con el ultimo tramo de la ruta se distinguen sin volverse una URL entera.
 */
function labelOf(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const slug = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (!slug) return host;
    const short = slug.length > 40 ? `${slug.slice(0, 40)}…` : slug;
    return `${host}/${decodeURIComponent(short)}`;
  } catch {
    return url;
  }
}

export async function resolveCitations(
  citations: ResearchCitation[],
  fetchUrl: CitationFetch = defaultFetch,
): Promise<ResearchCitation[]> {
  const resolved = await Promise.all(
    citations.map(async (citation) => {
      try {
        const final = await fetchUrl(citation.url);
        // Un redirect que no lleva a ninguna parte devuelve la misma URL: en ese
        // caso el titulo del proveedor —el dominio— sigue siendo lo mejor que hay.
        if (!final.url || final.url === citation.url) return citation;
        // El titulo se reemplaza, no se concatena: "ebay.com · ebay.com" era el
        // dominio del proveedor pegado al dominio resuelto, dos veces lo mismo.
        return { url: final.url, title: labelOf(final.url) };
      } catch {
        return citation;
      }
    }),
  );
  const seen = new Set<string>();
  return resolved.filter((citation) => {
    if (seen.has(citation.url)) return false;
    seen.add(citation.url);
    return true;
  });
}
