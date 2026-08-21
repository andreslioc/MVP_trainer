/**
 * Mensajes reales del chat de un live de Super Store (18-ago-2026, 2 h 20 min),
 * etiquetados a mano.
 *
 * Existen como fixture y no como ejemplos inventados porque la linea entre
 * pregunta y ruido en un live de TikTok no es la que uno supondria: 72 de los
 * 248 mensajes distintos de ese live son preguntas ELIPTICAS —sin verbo, sin
 * signo, a veces de una sola palabra— y cualquier regla que exija "?" o palabra
 * interrogativa borra el 29% de las preguntas reales.
 */

/** Piden informacion. Todas, aunque no lo parezcan. */
export const PREGUNTAS_REALES = [
  // Explicitas.
  "De que cuidad se encuentran ?",
  "buenas tardes que precio tiene el maxcalm",
  "tienes glicinato de magnesio? de muy buena absorción?",
  "Que medios de pago??",
  "incluye envío?",
  "cuántos gramos tiene el maxcal?",
  // Elipticas: el nombre del producto, o la palabra precio, ya es la pregunta.
  "precio???",
  "valor",
  "a como",
  "A cuánto",
  "Del original",
  "Omega 3 now",
  "cal max",
  "pastillas fen",
  "fibra biofit",
  "Cápsulas",
  "TNT 10",
  "para cortisol",
  "oregano",
  // Necesidad expresada: es pedir una recomendacion.
  "para bajar de peso",
  "productos para bajar de peso",
  "quiero algo que me ayude adelgazar pero de verdad",
  // Condicion de salud: son preguntas Y entran por la ruta de cautela.
  "para la artritis reumatoidea degenerativa para frenarla",
  "buenas tardes  una embarazada lo puede consumir",
  "Maxcalm sirve para diabéticos?",
  "que tiene para el hongos cándida en la mujer",
  "Hola recétame algo para ir al baño llevo 7 días de no ir estoy desesperada",
  "hola el calm lo recomiendas cuando tengo hígado graso me ayudará gracias",
] as const;

/** No piden nada. Hoy contaminaban la lista de "sin responder". */
export const NO_SON_PREGUNTAS = [
  // Un viewer respondiendole a otro. Si esto contara como respuesta, la
  // pregunta saldria contestada sin que la asesora dijera nada.
  "@Maria Paula_ 189.000",
  "@Belinda Vinasco 180 mil pesos",
  // Intencion de compra sin preguntar.
  "Yo quiero el Max calm",
  "me interesa",
  "Te voy a escribir",
  "ya te escribí para adquirir el producto",
  "si quiero pedirlo",
  // Testimonio propio.
  "Claro ya compré el maxcalm y realmente es excelente producto",
  "El dht me está funcionando muy bien",
  "el mio es pequeño y sabe a crema de arroz",
  // Cortesia y llegadas.
  "Holi",
  "Acabo de llegar",
  "Entré recién al en vivo",
  "dale Fer",
  "soy Sara",
  "ahssss chao",
  "okey gracias ☺️☺️☺️",
  // Afirmacion u objecion que no pide dato.
  "pero ese no es el original",
  "entonces no es el original",
] as const;
