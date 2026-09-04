import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardGrid } from "../../src/components/ui/card-grid.tsx";
import { Card, cardClasses } from "../../src/components/ui/card.tsx";
import { PageSection } from "../../src/components/ui/page-section.tsx";

/**
 * Las tres primitivas de acomodo: la tarjeta, la rejilla y el contenedor de
 * pantalla. Lo que se afirma no es que se vean bonitas —eso no se prueba— sino
 * las tres invariantes que se desviaron cuando cada pantalla las escribia a
 * mano: mismo aire, misma escalera de columnas y mismo ancho por tipo de
 * pantalla.
 */

/** Las pantallas del dia a dia, ya pasadas a las primitivas. */
const convertidas = [
  "src/app/(app)/app/page.tsx",
  "src/app/(app)/app/pre-training/page.tsx",
  "src/app/(app)/app/pre-training/[id]/page.tsx",
  "src/app/(app)/app/training/page.tsx",
  "src/app/(app)/app/training/[sessionId]/page.tsx",
  "src/app/(app)/app/training/[sessionId]/resumen/page.tsx",
  "src/app/(app)/app/copilot/page.tsx",
  "src/app/(app)/app/intelligence/page.tsx",
  "src/app/(app)/app/analiticas/page.tsx",
  "src/app/(app)/app/analiticas/[advisorId]/page.tsx",
  "src/app/(app)/app/analiticas/[advisorId]/practicas/page.tsx",
  "src/app/(app)/app/analiticas/[advisorId]/practicas/[sessionId]/page.tsx",
];

const fuenteDe = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");

describe("Card", () => {
  it("da el mismo aire y el mismo borde por defecto", () => {
    const clases = cardClasses();
    expect(clases).toContain("rounded-card");
    expect(clases).toContain("border-border");
    expect(clases).toContain("bg-surface");
    expect(clases).toContain("p-5");
  });

  it("no pone padding cuando la tarjeta trae su propio aire", () => {
    // El caso de la ficha de producto: la foto pega al borde y el cuerpo lleva
    // su propio p-4. Un padding del contenedor le sumaria un margen doble.
    expect(cardClasses({ density: "sin" })).not.toMatch(/\bp-\d/);
  });

  it("cada tono trae su color de texto, no solo el fondo", () => {
    // El fallo que evita: un fondo de alerta con el texto del cuerpo encima.
    // En el tema oscuro los fondos del semaforo son oscuros y el texto del
    // cuerpo es casi blanco, asi que el par tiene que viajar completo.
    for (const tone of ["alerta", "atencion", "logro"] as const) {
      expect(cardClasses({ tone })).toMatch(/text-confidence-(low|mid|high)-fg/);
    }
  });

  it("solo la tarjeta interactiva reacciona al puntero, y respeta el movimiento reducido", () => {
    expect(cardClasses()).not.toContain("hover:");
    const interactiva = cardClasses({ interactive: true });
    expect(interactiva).toContain("hover:border-primary");
    expect(interactiva).toContain("motion-reduce:transition-none");
  });

  it("se renderiza como un div con las clases del tono pedido", () => {
    const markup = renderToStaticMarkup(<Card tone="tinte">contenido</Card>);
    expect(markup).toContain("bg-primary-tint");
    expect(markup).toContain("contenido");
  });
});

describe("CardGrid", () => {
  it("empieza siempre en una columna", () => {
    // A 320 px —el ancho minimo que exige el sistema— dos columnas dejan
    // tarjetas de 140 px, donde no cabe un numero con su etiqueta.
    for (const columns of [2, 3, 4] as const) {
      const markup = renderToStaticMarkup(<CardGrid columns={columns}>x</CardGrid>);
      const clases = (markup.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
      // Sin prefijo de breakpoint no hay ninguna columna: la base es una sola.
      expect(clases.filter((clase) => /^grid-cols-/.test(clase))).toEqual([]);
      expect(clases).toContain("sm:grid-cols-2");
    }
  });

  it("cuatro columnas pasan por dos y no por tres", () => {
    // 1, 2, 4 divide parejo; con 3 en medio, cuatro tarjetas dejan una fila
    // huerfana de una sola.
    const markup = renderToStaticMarkup(<CardGrid columns={4}>x</CardGrid>);
    expect(markup).toContain("lg:grid-cols-4");
    expect(markup).not.toContain("grid-cols-3");
    expect(markup).toContain("sm:grid-cols-2");
  });

  it("usa el mismo espacio entre tarjetas siempre", () => {
    for (const columns of [2, 3, 4] as const) {
      expect(renderToStaticMarkup(<CardGrid columns={columns}>x</CardGrid>)).toContain("gap-4");
    }
  });

  it("puede ser una lista cuando las tarjetas son comparables", () => {
    expect(renderToStaticMarkup(<CardGrid as="ul">x</CardGrid>)).toMatch(/^<ul/);
    expect(renderToStaticMarkup(<CardGrid>x</CardGrid>)).toMatch(/^<div/);
  });
});

describe("PageSection", () => {
  it("ata el titulo al nombre accesible de la seccion", () => {
    // Un solo h1 por pagina, con el id al que apunta aria-labelledby. Escrito a
    // mano en cada pantalla, ese par se desincroniza.
    const markup = renderToStaticMarkup(<PageSection title="Training">x</PageSection>);
    expect(markup).toContain('aria-labelledby="page-title"');
    expect(markup).toContain('id="page-title"');
    expect(markup).toMatch(/<h1[^>]*>Training<\/h1>/);
  });

  it("no promete un nombre accesible que no existe", () => {
    // Sin titulo no hay h1, y entonces `aria-labelledby` apuntaria a un id
    // ausente: el lector de pantalla anunciaria una seccion sin nombre.
    const markup = renderToStaticMarkup(<PageSection>x</PageSection>);
    expect(markup).not.toContain("aria-labelledby");
  });

  it("da un ancho distinto por tipo de pantalla y ninguno al completo", () => {
    expect(renderToStaticMarkup(<PageSection width="lectura">x</PageSection>)).toContain(
      "max-w-3xl",
    );
    expect(renderToStaticMarkup(<PageSection width="panel">x</PageSection>)).toContain("max-w-5xl");
    // `completo` deja mandar el tope del armazon en vez de poner otro adentro.
    expect(renderToStaticMarkup(<PageSection width="completo">x</PageSection>)).not.toContain(
      "max-w-",
    );
  });
});

describe("las pantallas del dia a dia", () => {
  it.each(convertidas)("%s usa las primitivas y no un ancho suelto", (ruta) => {
    const fuente = fuenteDe(ruta);
    expect(fuente).toContain("PageSection");
    // El fallo que evita: volver a escribir `<section className="max-w-6xl">` en
    // una pantalla, que es exactamente como se desviaron los nueve anchos que
    // habia antes.
    expect(fuente).not.toMatch(/<section[^>]*max-w-/s);
  });

  it("ninguna vuelve a armar una tarjeta a mano", () => {
    for (const ruta of convertidas) {
      const fuente = fuenteDe(ruta);
      expect(
        fuente,
        `${ruta} arma una tarjeta a mano en vez de usar Card o cardClasses`,
      ).not.toMatch(/rounded-card border border-border bg-surface/);
    }
  });
});
