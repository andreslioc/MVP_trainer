/**
 * Investigador de un hueco suelto de la ficha.
 *
 * "Sin confirmar" casi nunca significa que el dato no se pueda saber: significa
 * que nadie lo busco. Los seis huecos del aceite de oregano se resolvieron o se
 * precisaron en veinte minutos con busquedas que ya existian, y mientras tanto
 * la asesora tenia una pared donde debia haber una respuesta.
 *
 * Es un call site aparte y no una reinvestigacion completa por dos razones: la
 * ficha entera cuesta tres llamadas y dos minutos, y regenerar reemplaza el
 * contenido que alguien ya reviso. Aqui se pregunta UNA cosa y se responde UNA
 * cosa, sin tocar el resto.
 *
 * Y no corre en camara: el Copilot sigue respondiendo desde la ficha. Este paso
 * llena el hueco para la proxima vez que alguien pregunte.
 */
export const VERIFY_GAP_PROMPT = `
Recibes una referencia exacta de producto y UN dato que la ficha no tiene confirmado.

Tu unico trabajo es averiguar ese dato para ESA referencia. No investigues el producto entero, no
reescribas la ficha y no traigas datos que nadie te pidio.

LA REFERENCIA EXACTA MANDA. Un nombre parecido no es el mismo producto: no uses informacion de otra
marca, otra presentacion, otro tamaño, otra concentracion, otro sabor, otra formula, otra version,
ni de capsulas cuando la referencia es liquida. Si lo que encuentras es de otra presentacion, no
sirve: dilo y no lo uses.

ORDEN DE FUENTES. Nivel 1: etiqueta, empaque, sitio oficial del fabricante, ficha tecnica o manual
oficial. Nivel 2: distribuidores oficiales, organismos regulatorios, registros sanitarios publicos,
documentacion tecnica fiable. Nivel 3: comercios reconocidos que vendan exactamente esta
referencia. Las de nivel 3 solo complementan, salvo que el fabricante no publique el dato: ahi se
usan y se dice de donde salio.

NO ENCONTRARLO ES UN RESULTADO VALIDO Y UTIL. Si buscaste bien y el dato no esta publicado, eso es
lo que hay que reportar, con lo que si averiguaste por el camino. "No aparece en el registro
publico" es una respuesta mucho mas util que "sin confirmar", porque la siguiente persona no repite
la busqueda. Lo que no vale es rellenar con una suposicion.

Distingue tres desenlaces:
- confirmado: encontraste el dato para esta referencia, con su fuente.
- no publicado: buscaste donde correspondia y el dato no existe publicamente, o el registro dice
  que no esta. Explica que revisaste.
- contradictorio: dos fuentes dicen cosas distintas y no puedes decidir por jerarquia. Reporta las
  dos y no elijas.

El hallazgo se escribe para que lo lea una persona del equipo, no una clienta: puede llevar
nombres tecnicos y numeros. Quien decide como se dice en camara es otro paso.

Cita la URL de cada cosa que reportes. Sin fuente, el dato no existe.
`.trim();

export const STRUCTURE_GAP_PROMPT = `
Recibes la investigacion de un hueco de ficha y las fuentes que se abrieron. Reordenala en el
contrato estructurado. No busques nada: solo ordena lo que ya esta escrito.

- Usa exclusivamente lo que dice la investigacion. No agregues datos nuevos.
- outcome es "confirmado" solo si la investigacion trae el dato para ESA referencia con su fuente.
  Si dice que no lo encontro, es "no_publicado". Si trae dos versiones que se contradicen y no
  resuelve cual manda, es "contradictorio".
- finding es lo que quedo claro, en dos o tres frases, escrito para el equipo. Cuando el desenlace
  es "no_publicado", finding dice DONDE se busco y que se encontro en su lugar: es lo que evita que
  la siguiente persona repita la busqueda.
- searched_in nombra las fuentes que se revisaron, aunque no tuvieran el dato.
- sources solo lleva las que respaldan el hallazgo, con su URL tal como aparece en la lista.
- Si la investigacion no trae ninguna fuente, outcome es "no_publicado" y sources va vacio.
`.trim();

type VerifyGapInput = {
  product: {
    name: string;
    brand: string;
    presentation: string;
    format: string;
    category: string;
  };
  gap: string;
};

export function buildVerifyGapPrompt(input: VerifyGapInput) {
  return {
    system: VERIFY_GAP_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          "REFERENCIA EXACTA:",
          `Nombre: ${input.product.name}`,
          `Marca: ${input.product.brand}`,
          `Presentacion: ${input.product.presentation}`,
          `Formato: ${input.product.format}`,
          `Categoria: ${input.product.category}`,
          "",
          "DATO SIN CONFIRMAR QUE HAY QUE AVERIGUAR:",
          input.gap,
          "",
          "Busca en internet y reporta lo que encuentres para ESTA referencia, citando la URL de",
          "cada dato. Si no esta publicado, dilo y explica donde buscaste.",
        ].join("\n"),
      },
    ],
  };
}

export function buildStructureGapPrompt(input: {
  gap: string;
  research: string;
  citations: Array<{ url: string; title: string }>;
}) {
  return {
    system: STRUCTURE_GAP_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          `DATO BUSCADO: ${input.gap}`,
          "",
          "INVESTIGACION:",
          input.research,
          "",
          "FUENTES CONSULTADAS:",
          input.citations.map((source) => `- ${source.title}: ${source.url}`).join("\n"),
        ].join("\n"),
      },
    ],
  };
}
