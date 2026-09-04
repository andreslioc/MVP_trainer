/**
 * Los tres estados del tema y como se guardan. Sin imports, a proposito.
 *
 * Lo lee el servidor —para estampar `data-theme` en el primer render y que no
 * haya un parpadeo de claro antes de pintar oscuro— y lo lee el interruptor,
 * que es un componente cliente. Si esto viviera junto a la sesion o a la base,
 * el bundle del navegador arrastraria el cliente de Postgres por leer una
 * preferencia de color. Es el mismo motivo por el que `roles.ts` vive solo.
 */

export const THEMES = ["sistema", "claro", "oscuro"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * "sistema" es el estado por defecto y NO estampa atributo: sin `data-theme`
 * manda `prefers-color-scheme`, que es justo lo que se quiere.
 */
export const DEFAULT_THEME: Theme = "sistema";

export const THEME_COOKIE = "tema";

/** Un año: la preferencia de color no es algo que se reelija cada semana. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_LABELS: Record<Theme, string> = {
  sistema: "Automático",
  claro: "Claro",
  oscuro: "Oscuro",
};

/** Lo que se dice al lector de pantalla, porque el icono solo no lo dice. */
export const THEME_DESCRIPTIONS: Record<Theme, string> = {
  sistema: "Sigue el tema del dispositivo",
  claro: "Forzar tema claro",
  oscuro: "Forzar tema oscuro",
};

export function parseTheme(value: string | undefined | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/**
 * El valor de `data-theme` en `<html>`, o `undefined` cuando manda el sistema.
 *
 * El CSS distingue tres casos con dos nombres: sin atributo consulta
 * `prefers-color-scheme`; `light` cancela ese oscuro automatico; `dark` lo
 * fuerza. De ahi que "claro" no sea la ausencia de atributo.
 */
export function themeAttribute(theme: Theme): "dark" | "light" | undefined {
  if (theme === "oscuro") return "dark";
  if (theme === "claro") return "light";
  return undefined;
}
