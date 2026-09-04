import { globSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfidenceBadge, type ConfidenceLevel } from "../../src/components/confidence-badge.tsx";
import { AA_TEXT, AA_UI, contrast } from "./contrast.ts";

const styles = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

/**
 * Los tokens de un bloque, leidos del CSS de verdad.
 *
 * Se parsea el archivo en vez de mantener una copia de la paleta en la prueba:
 * una copia se desvia, y entonces la prueba afirma colores que la app ya no
 * usa. `desde` es el texto que abre el bloque; se lee hasta su cierre.
 */
function tokensDe(desde: string) {
  const inicio = styles.indexOf(desde);
  expect(inicio, `no encontre el bloque ${desde}`).toBeGreaterThan(-1);
  const cuerpo = styles.slice(inicio + desde.length);
  const fin = cuerpo.indexOf("\n}");
  const declaraciones = cuerpo.slice(0, fin === -1 ? undefined : fin);
  const tokens: Record<string, string> = {};
  for (const [, nombre, valor] of declaraciones.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    if (nombre && valor) tokens[nombre] = valor.trim();
  }
  return tokens;
}

const claro = tokensDe(":root {");
const oscuroSistema = tokensDe(
  '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {',
);
const oscuroElegido = tokensDe(':root[data-theme="dark"] {');

/**
 * Los pares que tienen que cumplir, con su minimo. Es la misma tabla para las
 * dos paletas: un tema oscuro que cumple menos que el claro no es un tema, es
 * una excepcion.
 */
const pares: Array<[string, keyof typeof claro, keyof typeof claro, number]> = [
  ["cuerpo sobre el fondo", "fg", "background", AA_TEXT],
  ["cuerpo sobre una tarjeta", "fg", "surface", AA_TEXT],
  ["leyenda sobre el fondo", "fg-muted", "background", AA_TEXT],
  ["leyenda sobre una tarjeta", "fg-muted", "surface", AA_TEXT],
  ["enlace sobre el fondo", "primary", "background", AA_TEXT],
  ["enlace sobre una tarjeta", "primary", "surface", AA_TEXT],
  ["el paso fuerte como texto", "primary-deep", "surface", AA_TEXT],
  ["azul de soporte sobre una tarjeta", "support-blue", "surface", AA_TEXT],
  ["cuerpo sobre el tinte", "fg", "primary-tint", AA_TEXT],
  ["destructivo sobre una tarjeta", "destructive", "surface", AA_TEXT],
  // AA_UI y no AA_TEXT porque --success solo se usa como BORDE: sobre blanco da
  // 3.30:1 y no pasa como texto. Que siga siendo solo borde lo afirma la prueba
  // "el verde de exito no se usa como texto" mas abajo.
  ["exito sobre una tarjeta", "success", "surface", AA_UI],
  ["tinta del naranja sobre una tarjeta", "accent-ink", "surface", AA_TEXT],
  ["tinta de la menta sobre una tarjeta", "mint-ink", "surface", AA_TEXT],
  ["confianza alta", "confidence-high-fg", "confidence-high-bg", AA_TEXT],
  ["confianza media", "confidence-mid-fg", "confidence-mid-bg", AA_TEXT],
  ["confianza revisar", "confidence-low-fg", "confidence-low-bg", AA_TEXT],
  // Los rellenos: lo que importa es la tinta que va ENCIMA, no el relleno
  // contra el fondo. Es la regla que hace usable el naranja de la marca.
  ["tinta sobre el relleno primary", "primary-fg", "primary", AA_TEXT],
  ["tinta sobre el relleno del paso fuerte", "primary-fg", "primary-deep", AA_TEXT],
  ["tinta sobre el relleno naranja", "accent-fg", "accent", AA_TEXT],
  ["tinta sobre el relleno menta", "accent-fg", "mint", AA_TEXT],
  ["borde de control sobre una tarjeta", "border-control", "surface", AA_UI],
  ["borde de control sobre el fondo", "border-control", "background", AA_UI],
  ["borde amarillo accesible sobre una tarjeta", "warning-border", "surface", AA_UI],
];

describe("las dos paletas", () => {
  it("cubren exactamente los mismos tokens", () => {
    // El fallo que evita: agregar un token solo al tema claro. En oscuro
    // heredaria el valor claro y quedaria un color del tema equivocado, que es
    // el bug de tema oscuro mas comun y el mas dificil de ver en una captura.
    expect(Object.keys(oscuroElegido).sort()).toEqual(Object.keys(claro).sort());
  });

  it("los dos bloques oscuros son identicos", () => {
    // El bloque de `prefers-color-scheme` y el de eleccion explicita dicen lo
    // mismo. Van dos veces porque CSS no permite fusionar un selector
    // condicionado por @media con uno que no lo esta, y dos copias de la misma
    // verdad se desvian. Esta es la prueba que lo impide.
    expect(oscuroSistema).toEqual(oscuroElegido);
  });

  it.each([
    ["claro", claro],
    ["oscuro", oscuroElegido],
  ])("no dejan ningun token sin valor en el tema %s", (_tema, paleta) => {
    for (const [nombre, valor] of Object.entries(paleta)) {
      expect(valor, `--${nombre} quedo vacio`).not.toBe("");
      expect(valor, `--${nombre} apunta a otra variable`).not.toContain("var(");
    }
  });

  it.each([
    ["claro", claro],
    ["oscuro", oscuroElegido],
  ])("cumplen AA en el tema %s", (_tema, paleta) => {
    for (const [nombre, frente, fondo, minimo] of pares) {
      const a = paleta[frente];
      const b = paleta[fondo];
      expect(a, `falta --${String(frente)}`).toBeTruthy();
      expect(b, `falta --${String(fondo)}`).toBeTruthy();
      const razon = contrast(a as string, b as string);
      expect(
        razon,
        `${nombre}: ${String(frente)} sobre ${String(fondo)} da ${razon.toFixed(2)}:1, hace falta ${minimo}:1`,
      ).toBeGreaterThanOrEqual(minimo);
    }
  });

  it("declara color-scheme en los dos temas", () => {
    // Sin esto la barra de scroll y los controles nativos —fecha, select— se
    // quedan claros dentro de una pagina oscura.
    // El tema claro lo declara `:root`, que es donde vive la paleta clara.
    expect(Object.keys(claro)).not.toContain("color-scheme");
    expect(styles).toMatch(/:root {[\s\S]{0,200}?color-scheme: light;/);
    expect(styles).toMatch(/\[data-theme="dark"\] {\s*color-scheme: dark;/);
    expect(styles).toMatch(/prefers-color-scheme: dark\)[\s\S]{0,120}?color-scheme: dark;/);
  });
});

describe("la capa @theme", () => {
  it("solo mapea: ningun color de tema lleva un hex adentro", () => {
    const tema = tokensDe("@theme {");
    // Las excepciones son deliberadas y no siguen al tema: el panel de marca
    // del login lleva el isotipo blanco encima, el escenario del simulacro
    // imita una pantalla en vivo, el velo de los dialogos tiene que oscurecer y
    // la placa de foto tiene que ser clara porque las fotos del catalogo vienen
    // con fondo blanco opaco.
    const fijos = ["brand-panel", "stage", "scrim", "photo"];
    for (const [nombre, valor] of Object.entries(tema)) {
      if (!/^color-/.test(nombre)) continue;
      if (fijos.some((prefijo) => nombre.startsWith(`color-${prefijo}`))) continue;
      expect(valor, `--${nombre} deberia apuntar a una variable, no a ${valor}`).toMatch(/^var\(/);
    }
  });

  it("mantiene las dos familias de la marca en las pilas de fuentes", () => {
    // Roboto para cuerpo, Metropolis para titulares: las dos del manual.
    // Metropolis va NOMBRADA aunque todavia se sirva Jost, para que entre sola
    // el dia que se cargue la licenciada.
    expect(styles).toMatch(/--font-sans:[^;]*--font-roboto/s);
    expect(styles).toMatch(/--font-display:\s*\n?\s*Metropolis/);
  });
});

describe("la paleta del manual de marca", () => {
  it("conserva los valores de Galleon 7 en el tema claro", () => {
    expect(claro).toMatchObject({
      primary: "#0a5589",
      "primary-deep": "#022f40",
      "support-blue": "#0c7492",
      background: "#f5f5f5",
      fg: "#1c1c1c",
      accent: "#e6861c",
      mint: "#2ec4b6",
    });
  });

  it("empareja cada acento de marca con la tinta con la que si se puede escribir", () => {
    // El naranja y el verde menta dan 2.47:1 y 1.99:1 sobre el fondo claro: no
    // pasan AA como texto ni como borde. Solo sirven de relleno con
    // --accent-fg encima, y por eso cada uno viaja con su paso escribible. Si
    // alguien borra el paso, el sistema pierde la unica forma accesible de
    // escribir con esos tonos.
    // La medicion es del tema CLARO, que es sobre el que esta construido el
    // manual. Sobre el fondo oscuro los mismos tonos si pasarian —el naranja da
    // 5.25:1— pero la regla se mantiene igual en los dos temas: usarlos como
    // texto solo en oscuro partiria el sistema en dos vocabularios.
    expect(contrast(claro.accent as string, claro.background as string)).toBeLessThan(AA_TEXT);
    expect(contrast(claro.mint as string, claro.background as string)).toBeLessThan(AA_TEXT);
    for (const paleta of [claro, oscuroElegido]) {
      expect(paleta["accent-ink"]).toBeTruthy();
      expect(paleta["mint-ink"]).toBeTruthy();
      expect(
        contrast(paleta["accent-ink"] as string, paleta.surface as string),
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrast(paleta["mint-ink"] as string, paleta.surface as string),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("el verde de exito no se usa como texto", () => {
    // Sobre blanco da 3.30:1: sirve de borde y de relleno, no de texto. La
    // alternativa escribible es --confidence-high-fg, que va con su fondo.
    const fuentes = globSync("src/{app,components}/**/*.tsx", {
      cwd: new URL("../../", import.meta.url).pathname,
    });
    const usos = fuentes.filter((ruta) =>
      readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8").includes("text-success"),
    );
    expect(usos).toEqual([]);
  });

  it("mantiene el anillo de foco y respeta la reduccion de movimiento", () => {
    expect(styles).toMatch(/:focus-visible\s*{[^}]*var\(--primary-deep\)/s);
    expect(styles).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("empareja cada color de confianza con una etiqueta de texto explicita", () => {
    const levels: ConfidenceLevel[] = ["alto", "medio", "revisar"];
    const markup = levels.map((level) =>
      renderToStaticMarkup(createElement(ConfidenceBadge, { level })),
    );

    expect(markup.join(" ")).toContain("Alto");
    expect(markup.join(" ")).toContain("Medio");
    expect(markup.join(" ")).toContain("Revisar");
  });
});
