import { describe, expect, it } from "vitest";

import { productOptionLabel, shortenPresentation } from "../../src/lib/product-label.ts";

describe("shortenPresentation", () => {
  it("quita la palabra del envase y deja la cifra primero", () => {
    // Lo que la asesora compara entre dos hermanos es el numero. Con "Frasco
    // con" al frente, la cifra queda a mitad del renglon y en un `<select>`
    // angosto se sale del ancho visible.
    expect(shortenPresentation("Frasco con 150 cápsulas blandas")).toBe("150 cápsulas blandas");
    expect(shortenPresentation("Caja de 680 g (24 oz)")).toBe("680 g (24 oz)");
    expect(shortenPresentation("Envase en polvo de 8 oz (227 g)")).toBe("8 oz (227 g)");
    expect(shortenPresentation("Pack de 14 latas de 355 ml cada una")).toBe(
      "14 latas de 355 ml cada una",
    );
  });

  it("deja intacta la presentacion que ya empieza por la cifra", () => {
    expect(shortenPresentation("150 cápsulas blandas")).toBe("150 cápsulas blandas");
    expect(shortenPresentation("2 fl oz (59 mL)")).toBe("2 fl oz (59 mL)");
  });

  it("corta la nota que va despues del separador", () => {
    expect(shortenPresentation("Frasco de 2 fl oz · prueba escrita por alguien")).toBe("2 fl oz");
  });

  it("le pone tope al renglon sin partir una palabra", () => {
    // El fallo que evita: la presentacion del kit de Dr. Brown's dejaba una
    // etiqueta de 187 caracteres, que el `<select>` corta donde quiera.
    const larga = shortenPresentation(
      "Kit que incluye biberón de 270 mL (9 oz), tetina Nivel 3, boquilla de transición y manijas",
    );
    expect(larga.length).toBeLessThanOrEqual(45);
    expect(larga).toMatch(/…$/);
    // No parte una palabra por la mitad.
    expect(larga.replace(/…$/, "")).not.toMatch(/\s\S{1,2}$/);
    expect(larga).toContain("270 mL");
  });

  it("nunca devuelve vacio", () => {
    // Una presentacion que fuera solo la palabra del envase quedaria en nada, y
    // el `<option>` mostraria un renglon terminado en " · ".
    expect(shortenPresentation("Frasco")).toBe("Frasco");
    expect(shortenPresentation("Caja de")).toBe("Caja de");
  });
});

describe("productOptionLabel", () => {
  it("distingue dos empaques del mismo producto", () => {
    // El fallo que evita: los dos `<option>` decian el mismo texto y la asesora
    // elegia a ciegas cual de los dos frascos estaba vendiendo.
    const base = { name: "MultiGummies para Mujer", brand: "Centrum" };
    const cien = productOptionLabel({ ...base, presentation: "100 gomitas" });
    const ciento = productOptionLabel({ ...base, presentation: "170 gomitas (rinde 85 días)" });
    expect(cien).not.toBe(ciento);
    expect(cien).toContain("100 gomitas");
    expect(ciento).toContain("170 gomitas");
  });

  it("pone el producto antes de la marca", () => {
    // Con la marca de primera, las cinco referencias de Kirkland empiezan igual
    // y lo que las separa se sale del ancho del selector.
    const etiqueta = productOptionLabel({
      name: "CoQ10 300 mg",
      brand: "Kirkland Signature",
      presentation: "Frasco con 100 cápsulas blandas",
    });
    expect(etiqueta.indexOf("CoQ10")).toBeLessThan(etiqueta.indexOf("Kirkland"));
  });

  it("no repite el empaque cuando el nombre ya lo trae", () => {
    // La regla de nombres unicos mete `· 150 cápsulas` en el nombre de los
    // hermanos; sumarle "(150 cápsulas blandas)" al lado lo diria dos veces.
    const etiqueta = productOptionLabel({
      name: "Aceite de Orégano 4000 mg · 150 cápsulas (Oil of Oregano)",
      brand: "Piping Rock",
      presentation: "150 cápsulas blandas",
    });
    expect(etiqueta).toBe(
      "Aceite de Orégano 4000 mg · 150 cápsulas (Oil of Oregano) · Piping Rock",
    );
  });

  it("reconoce la misma unidad escrita de dos formas", () => {
    // El fallo que evita: el nombre decia "264 g" y la presentacion "264
    // gramos", asi que la etiqueta terminaba en "· 264 g · Vital Proteins ·
    // 264 gramos".
    expect(
      productOptionLabel({
        name: "Péptidos de Colágeno · 264 g",
        brand: "Vital Proteins",
        presentation: "264 gramos",
      }),
    ).toBe("Péptidos de Colágeno · 264 g · Vital Proteins");
    expect(
      productOptionLabel({
        name: "Galletas Original · 680 g",
        brand: "Milk-Bone",
        presentation: "Caja de 24 onzas (680 g)",
      }),
    ).toBe("Galletas Original · 680 g · Milk-Bone");
  });

  it("pega el nombre en español al del rótulo, antes de la marca", () => {
    // Es la traduccion DE ese nombre: con la marca en medio se
    // desemparejarian y pareceria otro dato mas.
    expect(
      productOptionLabel({
        name: "Oil of Oregano 4000 mg · 150 cápsulas",
        nameEs: "Aceite de orégano",
        brand: "Piping Rock",
        presentation: "150 cápsulas blandas",
      }),
    ).toBe("Oil of Oregano 4000 mg · 150 cápsulas — Aceite de orégano · Piping Rock");
  });

  it("no deja rastro cuando no hay nombre en español", () => {
    // Las fichas cuyo rotulo ya viene en español no tienen nada que traducir, y
    // un separador suelto se leeria como un dato que falta.
    const sinEs = productOptionLabel({
      name: "Bolsas para almacenar leche materna",
      brand: "Medela",
      presentation: "Caja con 100 unidades",
    });
    expect(sinEs).toBe("Bolsas para almacenar leche materna · Medela · 100 unidades");
    expect(sinEs).not.toContain("—");
    // Una cadena vacia o de espacios cuenta como ausente.
    expect(
      productOptionLabel({ name: "X", nameEs: "   ", brand: "Y", presentation: "1 g" }),
    ).not.toContain("—");
  });

  it("ignora acentos y ® al comparar", () => {
    expect(
      productOptionLabel({
        name: "CALM® Magnesio · 16 oz",
        brand: "Natural Vitality",
        presentation: "Envase de 16 oz (453 g)",
      }),
    ).not.toMatch(/16 oz.*16 oz/);
  });
});
