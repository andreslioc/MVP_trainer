/**
 * Prompt de cobertura de chat: que pregunto la audiencia y que quedo sin
 * responder.
 *
 * Vive separado de `analyze-transcript.ts` por una razon medida. Cuando las dos
 * tareas compartian una sola llamada, un live con 307 mensajes de chat produjo
 * 4 filas de cobertura —las cuatro de los primeros diez minutos— con
 * `finishReason: stop` y 3.179 de 8.000 tokens de salida. No se quedo sin
 * espacio: el system prompt terminaba en "es preferible devolver pocos insights
 * solidos", escrito para los hallazgos, y el modelo lo aplico tambien al chat.
 *
 * De ahi las dos decisiones de este archivo: prompt propio sin ninguna
 * instruccion de brevedad, y contrato de salida POR INDICE. El modelo no
 * reescribe la pregunta, la referencia; el texto que se guarda es el que
 * entro, ya redactado. Eso ahorra tokens de salida y cierra de paso la puerta
 * a que el modelo reintroduzca un identificador al parafrasear.
 */

import type { ChatQuestionGroup } from "../../chat-log.ts";

export const CHAT_COVERAGE_PROMPT = `
Eres analista de una tienda colombiana de suplementos que vende por TikTok Live.

Recibes DOS cosas:
1. Un tramo de la TRANSCRIPCION del live, con marcas [Xs] que indican el segundo.
2. Una lista NUMERADA de mensajes del chat de ese mismo tramo.

Tu unica tarea: por cada mensaje numerado, decidir si la asesora lo respondio en la transcripcion.

REGLAS DE COBERTURA — son obligatorias:
- Procesa la lista COMPLETA, en orden, del primer numero al ultimo. No omitas ninguno.
  Devolver menos entradas de las que recibiste es un error, aunque el mensaje sea trivial.
- Cada entrada lleva es_pregunta. Si es false, answered=false y evidence_quote=null.

QUE CUENTA COMO PREGUNTA (es_pregunta=true):
- Cualquier peticion de informacion sobre producto, precio, envio, pago o ubicacion.
- Una pregunta NO necesita signo de interrogacion ni verbo. En un live de ventas, decir el
  nombre de un producto O la palabra precio ES preguntar. Todos estos son preguntas:
  "precio???", "valor", "a como", "A cuanto", "Del original", "Omega 3 now", "cal max",
  "pastillas fen", "fibra biofit", "Capsulas", "TNT 10", "para cortisol", "oregano".
- Decir para que se necesita algo es pedir una recomendacion, y es pregunta:
  "para bajar de peso", "productos para bajar de peso", "quiero algo que me ayude adelgazar".
- Mencionar una condicion de salud buscando que producto sirve es pregunta:
  "para la artritis reumatoidea", "una embarazada lo puede consumir", "sirve para diabeticos",
  "que tiene para el hongo candida", "recetame algo para ir al bano".

QUE NO ES PREGUNTA (es_pregunta=false):
- Un mensaje dirigido a otro viewer, o que responde a otro viewer. Se reconocen porque empiezan
  mencionando a alguien: "@Maria Paula_ 189.000", "@Belinda Vinasco 180 mil pesos".
- Intencion de compra sin preguntar nada: "Yo quiero el Max calm", "me interesa",
  "Te voy a escribir", "ya te escribi para adquirir el producto", "si quiero pedirlo".
- Testimonio o experiencia propia: "Claro ya compre el maxcalm y es excelente producto",
  "El dht me esta funcionando muy bien", "el mio es pequeno y sabe a crema de arroz".
- Saludo, despedida, agradecimiento o aviso de llegada: "Holi", "Acabo de llegar",
  "Entre recien al en vivo", "okey gracias", "dale Fer", "soy Sara", "ahssss chao".
- Afirmacion u objecion que no pide dato: "pero ese no es el original",
  "entonces no es el original", "A mi el original no me costo todo eso".

CUANDO ESTA RESPONDIDA (answered=true):
- SOLO si la transcripcion contiene la respuesta, dicha por quien conduce el live.
  Que otro viewer haya contestado en el chat NO cuenta: eso no es la asesora respondiendo.
- Si la asesora hablo del producto pero no respondio lo que se pregunto, es answered=false.
- evidence_quote es la frase LITERAL de la transcripcion que responde, maximo 15 palabras.
  Si answered=false, va en null.
- at_seconds es el segundo de la marca [Xs] de la linea que contiene esa frase. Si la linea no
  trae marca, null. No lo estimes ni lo deduzcas del orden.
- Usa exclusivamente la transcripcion entregada. No inventes respuestas ni supongas que algo
  se contesto fuera del tramo.
- No reescribas el texto del mensaje: solo devuelves su numero. Si ves [telefono], [correo] o
  [nombre], no los reemplaces por nada.
`.trim();

export type ChatCoverageBatchInput = {
  transcript: string;
  questions: readonly ChatQuestionGroup[];
};

/**
 * Formato compacto por linea: `numero [segundo] (xveces) texto`.
 *
 * El numero es el contrato de salida. El segundo le dice al modelo donde mirar
 * dentro del tramo. El conteo aparece porque una pregunta repetida veinte veces
 * es informacion, no ruido —aunque el modelo no la use para decidir.
 */
export function formatQuestions(questions: readonly ChatQuestionGroup[]) {
  return questions
    .map((question, index) => {
      const mark = question.atSeconds === null ? "" : `[${question.atSeconds}s] `;
      const repeat = question.askedCount > 1 ? `(x${question.askedCount}) ` : "";
      return `${index} ${mark}${repeat}${question.text}`;
    })
    .join("\n");
}

export function buildChatCoveragePrompt(input: ChatCoverageBatchInput) {
  return {
    system: CHAT_COVERAGE_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          "TRANSCRIPCION DEL TRAMO:",
          input.transcript || "(sin transcripcion para este tramo)",
          "",
          `MENSAJES DEL CHAT (${input.questions.length}, numerados de 0 a ${input.questions.length - 1}):`,
          formatQuestions(input.questions),
        ].join("\n"),
      },
    ],
  };
}
