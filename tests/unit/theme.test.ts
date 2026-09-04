import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEMES,
  parseTheme,
  themeAttribute,
} from "../../src/lib/theme.ts";

describe("parseTheme", () => {
  it("acepta los tres estados", () => {
    for (const theme of THEMES) {
      expect(parseTheme(theme)).toBe(theme);
    }
  });

  it("cae en automatico ante cualquier cosa que no reconozca", () => {
    // La cookie la escribe el navegador y llega del cliente: un valor inventado
    // no puede terminar como atributo en `<html>`.
    for (const basura of [undefined, null, "", "dark", "DARK", "oscuro ", "<script>"]) {
      expect(parseTheme(basura)).toBe(DEFAULT_THEME);
    }
  });

  it("automatico es el estado por defecto", () => {
    expect(DEFAULT_THEME).toBe("sistema");
  });
});

describe("themeAttribute", () => {
  it("no estampa nada cuando manda el dispositivo", () => {
    // Sin atributo el CSS consulta `prefers-color-scheme`, que es exactamente
    // lo que significa "automatico". Estampar "light" ahi congelaria el tema.
    expect(themeAttribute("sistema")).toBeUndefined();
  });

  it("claro NO es la ausencia de atributo", () => {
    // El fallo que evita: tratar "claro" como el default. En un dispositivo en
    // oscuro, sin atributo el `@media` gana y la pantalla sale oscura aunque la
    // persona haya pedido claro. `light` es lo que cancela ese automatico.
    expect(themeAttribute("claro")).toBe("light");
    expect(themeAttribute("oscuro")).toBe("dark");
  });
});

describe("el contrato de la cookie", () => {
  it("todos los estados tienen etiqueta y descripcion", () => {
    // El interruptor son tres botones con icono de texto: sin descripcion, un
    // lector de pantalla no distingue "Claro" de "Automático".
    for (const theme of THEMES) {
      expect(THEME_LABELS[theme]).toBeTruthy();
      expect(THEME_DESCRIPTIONS[theme]).toBeTruthy();
    }
  });

  it("dura un año y no una sesion", () => {
    // Si expirara con la sesion, la preferencia se perderia al cerrar el
    // navegador y la pantalla volveria a decidirla el dispositivo.
    expect(THEME_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
    expect(THEME_COOKIE).toBe("tema");
  });
});
