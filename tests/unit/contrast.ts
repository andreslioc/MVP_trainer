/**
 * Razon de contraste de WCAG 2.1, para poder AFIRMAR la accesibilidad del color
 * en vez de creerle a un comentario.
 *
 * Vive en las pruebas y no en `src/lib`: la app nunca calcula contraste en
 * caliente, lo unico que necesita es que la paleta ya cumpla. La formula es la
 * de la especificacion —luminancia relativa con la correccion de gama sRGB— y
 * no una aproximacion por brillo.
 */

function canal(valor: number) {
  return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string) {
  const limpio = hex.replace("#", "");
  const expandido =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(expandido.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(r ?? 0) + 0.7152 * canal(g ?? 0) + 0.0722 * canal(b ?? 0);
}

export function contrast(a: string, b: string) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

/** Texto normal en AA. */
export const AA_TEXT = 4.5;

/** Bordes de control y componentes de interfaz en AA. */
export const AA_UI = 3;
