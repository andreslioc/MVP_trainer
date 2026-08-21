import { describe, expect, it } from "vitest";

import {
  buildCopilotComposePrompt,
  COPILOT_COMPOSE_PROMPT,
} from "../../src/lib/ai/prompts/copilot.ts";
import { productKnowledgeForPrompt } from "../../src/lib/ai/prompts/generate-questions.ts";
import { questionIntentSchema } from "../../src/lib/ai/schemas.ts";

const ficha = {
  name: "Max Calm",
  brand: "Super Store",
  category: "bienestar",
  presentation: "300 g",
  format: "polvo",
  activeIngredients: [],
  benefits: [],
  faqs: [],
  objections: [],
  differentiators: [],
  precautions: "",
  claimsAllowed: [],
  claimsCaution: [],
  claimsForbidden: [],
  sources: [],
};

describe("el prompt de composicion usa la intencion", () => {
  it("dice que priorizar para CADA intencion que el clasificador puede devolver", () => {
    // Antes se clasificaban ocho intenciones y no se usaba ninguna: la misma
    // plantilla respondia igual "¿para que sirve?" que "¿puedo tomarlo
    // embarazada?". Si alguien agrega una intencion al enum y no la documenta
    // aqui, esta prueba lo dice.
    for (const intent of questionIntentSchema.options) {
      expect(COPILOT_COMPOSE_PROMPT).toContain(intent);
    }
  });

  it("declara que el proposito es vender", () => {
    expect(COPILOT_COMPOSE_PROMPT).toContain("VENDER");
  });

  it("prohibe vender en la ruta de seguridad, que es donde la venta cede", () => {
    const seguridad = COPILOT_COMPOSE_PROMPT.slice(COPILOT_COMPOSE_PROMPT.indexOf("- seguridad:"));
    expect(seguridad).toContain("NO vendas");
  });

  it("no presenta las seis piezas como lista de verificacion", () => {
    // El doc del proyecto dice "puede combinar, segun el caso" y que el sistema
    // "no debe colocar todas las promociones, beneficios y CTAs en todas las
    // respuestas". Un prompt que las pide siempre hace que todas suenen igual.
    expect(COPILOT_COMPOSE_PROMPT).toContain("NO son una lista de verificacion");
  });

  it("da el presupuesto en palabras, no solo en segundos", () => {
    // El modelo no sabe a que velocidad habla la asesora. 15-20 s no le dice
    // nada; 40 palabras si.
    expect(COPILOT_COMPOSE_PROMPT).toMatch(/express:\s*40 palabras/);
  });

  it("nombra las tres listas de claims para que la ficha gobierne", () => {
    for (const lista of ["claims_allowed", "claims_caution", "claims_forbidden"]) {
      expect(COPILOT_COMPOSE_PROMPT).toContain(lista);
    }
  });
});

describe("la ficha que llega al prompt", () => {
  it("dice si esta verificada, que es lo que decide confianza alto", () => {
    expect(productKnowledgeForPrompt({ ...ficha, verifiedAt: new Date() }).verified).toBe(true);
    expect(productKnowledgeForPrompt({ ...ficha, verifiedAt: null }).verified).toBe(false);
  });

  it("entrega el precio especial ya calculado, no el porcentaje para que el modelo lo aplique", () => {
    // El descuento entra por la sesion de live, no por la ficha.
    const conocimiento = productKnowledgeForPrompt(
      { ...ficha, verifiedAt: new Date(), priceCop: 189_000 },
      15,
    );

    expect(conocimiento.price).toBe("$189.000");
    expect(conocimiento.promo_price).toBe("$161.000");
  });

  it("sin precio especial en la sesion no manda ninguna cifra con descuento", () => {
    const conocimiento = productKnowledgeForPrompt({
      ...ficha,
      verifiedAt: new Date(),
      priceCop: 189_000,
    });

    expect(conocimiento.promo_price).toBeNull();
    expect(conocimiento.promo_percent).toBeNull();
  });

  it("prohibe al modelo calcular o reescribir un precio", () => {
    // Sin saltos de linea en la asercion: el prompt se ajusta a 100 columnas y
    // una frase partida hacia fallar la prueba por como quedo el parrafo, no
    // por lo que dice.
    const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");
    expect(plano).toContain("NUNCA multipliques, restes, redondees ni reescribas el formato");
    expect(plano).toContain("Ningun precio se calcula ni se reescribe");
    expect(plano).toContain("COPIALOS LETRA POR LETRA");
  });
});

describe("lo que el Copilot no puede decirle a una clienta", () => {
  it("prohibe nombrar herramientas internas, aunque la ficha las mencione", () => {
    // Caso real: un diferencial sembrado decia "La informacion se mantiene en
    // el Knowledge Hub", y el Copilot se lo dijo tal cual a la clienta en
    // camara. El modelo uso la ficha con fidelidad; el problema es que nadie le
    // habia dicho que hay vocabulario que no sale del equipo.
    expect(COPILOT_COMPOSE_PROMPT).toContain("Knowledge Hub");
    expect(COPILOT_COMPOSE_PROMPT).toContain("Nunca nombres herramientas ni sistemas");
    expect(COPILOT_COMPOSE_PROMPT).toContain("palabras de la clienta");
  });

  it("obliga a decir el precio especial cuando esta encendido", () => {
    // Se prende a mano en la pantalla del Copilot: callarlo es tirar a la
    // basura la unica accion que la asesora tomo antes de preguntar.
    expect(COPILOT_COMPOSE_PROMPT).toContain("OBLIGATORIO mencionarlo");
  });
});

describe("las fichas sembradas hablan como una clienta", () => {
  it("ningun texto de la semilla nombra una herramienta interna", async () => {
    const { readFileSync } = await import("node:fs");
    const seed = readFileSync("scripts/seed.ts", "utf8");
    // Los comentarios del archivo si pueden nombrarla; lo que no puede es el
    // contenido que viaja a la ficha y de ahi a la boca de la asesora.
    const contenido = seed
      .split("\n")
      .filter((linea) => !linea.trim().startsWith("//"))
      .join("\n");
    const diferenciales = contenido.slice(
      contenido.indexOf("differentiators"),
      contenido.indexOf("precautions"),
    );
    expect(diferenciales).not.toContain("Knowledge Hub");
  });
});

describe("como se dice un precio especial", () => {
  const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");

  it("exige los dos precios, no solo el especial", () => {
    // Caso real: la express decia "tiene un precio especial de $170.000" y nada
    // mas. Sin el precio normal al lado no hay con que compararlo, y el
    // descuento deja de leerse como ventaja.
    expect(plano).toContain("se dicen LOS DOS");
    expect(plano).toContain("primero price, despues promo_price");
  });

  it("ata el precio especial a este live", () => {
    expect(plano).toContain("por este live");
  });

  it("pide usar el presupuesto de la express, no quedarse corto", () => {
    expect(plano).toContain("una express de 20 palabras dejo fuera algo que si cabia");
  });
});

describe("de donde sale la respuesta directa", () => {
  const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");

  it("usa la respuesta de faqs cuando la pregunta coincide", () => {
    // Caso real: "Como se usa" existia en faqs y el modelo la uso bien. El
    // problema fue que la respuesta sembrada no respondia nada, asi que ahora
    // el prompt tambien dice que hacer con una faq insuficiente.
    expect(plano).toContain("su answer ES la respuesta directa");
    expect(plano).toContain('"mira la etiqueta" no responde "como se toma"');
  });

  it("prohibe inventarle condiciones a un incentivo", () => {
    // Caso real: la regla era {"threshold_cop": 120000} y el Copilot dijo
    // "envio gratis a todo el pais": quito el umbral e invento la cobertura.
    expect(plano).toContain("condicion EXACTA");
    expect(plano).toContain("envio gratis en compras desde $120.000");
    expect(plano).toContain("condiciones comerciales inventadas");
  });
});

describe("el objetivo que elige la asesora", () => {
  const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");

  it("documenta cada objetivo que el selector puede enviar", async () => {
    // El selector mandaba "informar con claridad" al modelo y el prompt no
    // decia una palabra de que hacer con eso: los tres objetivos producian la
    // misma respuesta. Si alguien agrega una opcion y no la documenta, esta
    // prueba lo dice.
    const { readFileSync } = await import("node:fs");
    const form = readFileSync("src/app/(app)/app/copilot/copilot-form.tsx", "utf8");
    const selector = form.slice(form.indexOf("Objetivo"), form.indexOf("Tono"));
    const opciones = [...selector.matchAll(/<option value="([^"]+)">/g)].map(([, valor]) => valor);

    expect(opciones.length).toBeGreaterThan(0);
    for (const objetivo of opciones) {
      expect(plano).toContain(`"${objetivo}"`);
    }
  });

  it("con objetivo de informar pone la respuesta y su por que antes de la promo", () => {
    expect(plano).toContain('Un "si, puedes" seguido de la promo no informo nada');
  });
});

describe("una respuesta de informacion explica, no solo confirma", () => {
  const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");

  it("exige el por que y de donde sacarlo", () => {
    // Caso real: "¿puedo tomar eso despues de entrenar?" con objetivo informar
    // devolvio "¡Claro que si! Puedes tomarla despues de entrenar" y de ahi
    // salto al envio gratis. Confirmo sin explicar, y la mitad de la express se
    // fue en la promo.
    expect(plano).toContain("DI EL POR QUE");
    expect(plano).toContain("el science_note del beneficio");
    expect(plano).toContain("no inventes la razon");
  });

  it("no deja que el por que sea lo primero que se cae en la express", () => {
    expect(plano).toContain("el por que de una pregunta de informacion o uso no se cae nunca");
  });
});

describe("una respuesta de precio", () => {
  const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");

  it("tiene forma fija: precio, envio gratis y el numero al que escribir", () => {
    expect(plano).toContain("Una respuesta de precio tiene forma fija");
    expect(plano).toContain("el envio gratis, que en una pregunta de precio se dice SIEMPRE");
    expect(plano).toContain("el CTA de escribir al numero");
  });

  it("sin precio en la ficha deja el envio y el CTA, que es lo unico cierto", () => {
    expect(plano).toContain("Ahi el envio gratis y el CTA si van");
  });
});

describe("como se dice un incentivo con umbral", () => {
  const envioGratis = {
    cta: null,
    incentive: { ruleKey: "envio_gratis", value: { threshold_cop: 120_000 } },
    ruleApplied: "envio_gratis",
  };
  const compose = (priceCop: number | null, promoPercent: number | null) =>
    buildCopilotComposePrompt({
      product: { ...ficha, verifiedAt: new Date(), priceCop },
      activeRules: [{ key: "envio_gratis", value: { threshold_cop: 120_000 } }],
      customerQuestion: "cuanto cuesta?",
      intent: "precio",
      objective: "guiar la compra",
      tone: "cercano",
      orchestration: envioGratis,
      promoPercent,
    });

  it("le dice al modelo que el umbral ya esta cumplido cuando el precio lo pasa", () => {
    // Caso real: la express decia "envio gratis por compras desde $120.000" de
    // un producto de $170.000, y eso se oye como si a la clienta le faltara.
    const contenido = compose(189_000, 10).messages[0]?.content ?? "";
    expect(contenido).toContain("ya pasa el umbral");
  });

  it("no lo da por cumplido cuando el precio especial queda por debajo", () => {
    const contenido = compose(130_000, 20).messages[0]?.content ?? "";
    expect(contenido).toContain("no consta que la compra pase el umbral");
  });

  it("sin precio en la ficha manda a decir la condicion exacta", () => {
    const contenido = compose(null, null).messages[0]?.content ?? "";
    expect(contenido).toContain("la condicion se dice exacta");
  });

  it("el prompt trata ese dato como la unica excepcion a la condicion exacta", () => {
    const plano = COPILOT_COMPOSE_PROMPT.replace(/\s+/g, " ");
    expect(plano).toContain("UNICA excepcion: cuando CONDICION DEL INCENTIVO dice");
    expect(plano).toContain("y el envio te sale gratis");
  });
});
