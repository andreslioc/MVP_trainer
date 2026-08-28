/**
 * Regla de concrecion: un beneficio tiene que poder señalarse.
 *
 * "Soporte al bienestar general — se utiliza tradicionalmente para apoyar
 * diversos objetivos de salud" pasa todos los filtros de seguridad y no dice
 * absolutamente nada. Una clienta pregunta para que sirve y la respuesta es
 * "para varias cosas".
 *
 * No es un descuido del modelo: es a donde lo empuja la capa de seguridad. Sus
 * formas prudentes —"apoya", "contribuye a", "se utiliza como complemento
 * para"— son correctas, y sin un contrapeso terminan en la frase mas segura de
 * todas, que es la que no afirma nada. La seguridad sola produce vaguedad; hace
 * falta una regla que exija sustancia dentro de lo permitido.
 *
 * La prueba: si al leer el beneficio cabe preguntar "¿como cual?" y la ficha no
 * puede contestar, no es un beneficio. Es relleno.
 */

/**
 * Frases que estan vacias en cualquier contexto. No dependen de con que vayan
 * acompañadas: prometen variedad sin nombrar una sola cosa.
 */
export const EMPTY_PHRASES = [
  "diversos objetivos",
  "varios objetivos",
  "diferentes objetivos",
  "objetivos de salud",
  "multiples beneficios",
  "diversos beneficios",
  "varios beneficios",
  "muchos beneficios",
  "multiples funciones",
  "varias funciones",
  "diversas funciones",
  "multiples usos",
  "diversos usos",
  "diversas necesidades",
  "propiedades beneficiosas",
  "apoyo integral",
  "bienestar integral",
  "amplia gama",
  "entre otros beneficios",
  "diferentes propositos",
  "distintos propositos",
] as const;

/**
 * Palabras que no aportan informacion por si solas.
 *
 * No estan prohibidas —"bienestar" es una palabra honesta— pero un beneficio
 * hecho SOLO de estas no dice nada. "Soporte al bienestar general" son tres
 * palabras de esta lista y cero datos.
 */
const GENERIC_WORDS = new Set([
  "apoyo",
  "apoya",
  "soporte",
  "soporta",
  "ayuda",
  "contribuye",
  "complemento",
  "complementa",
  "bienestar",
  "salud",
  "saludable",
  "general",
  "generales",
  "integral",
  "diario",
  "diaria",
  "natural",
  "naturales",
  "propiedades",
  "beneficios",
  "beneficio",
  "calidad",
  "optimo",
  "optima",
  "mejor",
  "mejora",
  "vitalidad",
  "energia",
  "equilibrio",
  "cuidado",
  "rutina",
  "organismo",
  "cuerpo",
  "para",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "al",
  "a",
  "en",
  "con",
  "su",
  "tu",
  "que",
  "se",
]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}

/** Devuelve la frase vacia encontrada, o `null`. */
export function findEmptyPhrase(value: string): string | null {
  const text = normalize(value);
  return EMPTY_PHRASES.find((phrase) => text.includes(phrase)) ?? null;
}

/**
 * `true` cuando cada palabra del texto sale de la lista generica: la frase no
 * nombra ningun ingrediente, cantidad, parte del cuerpo ni situacion de uso.
 *
 * Un numero cuenta como sustancia: "393 porciones por frasco" es concreto
 * aunque sus otras palabras sean comunes.
 */
/**
 * Palabras de envase, cantidad y manejo.
 *
 * Un beneficio dice que hace el producto por la persona. "Rinde 393 porciones"
 * y "aporta 14 mg por porcion" son datos ciertos y utiles —y no son beneficios:
 * son rendimiento y composicion, y tienen sus propios campos. Meterlos en el
 * espacio del beneficio deja la ficha sin responder la unica pregunta que
 * importa: que gano yo con esto.
 *
 * Es el error contrario a la vaguedad, y se cae en el huyendo de ella: al exigir
 * un dato concreto, lo mas facil es tomarlo de la etiqueta.
 */
const PACKAGING_WORDS = new Set([
  "porcion",
  "porciones",
  "frasco",
  "frascos",
  "botella",
  "envase",
  "capsula",
  "capsulas",
  "softgel",
  "softgels",
  "tableta",
  "tabletas",
  "gomita",
  "gomitas",
  "gotas",
  "gotero",
  "ml",
  "mg",
  "mcg",
  "gramos",
  "onzas",
  "unidades",
  "sobres",
  "rinde",
  "dura",
  "trae",
  "contiene",
  "aporta",
  "toma",
  "tomar",
  "aplica",
  "aplicar",
  "usa",
  "usar",
  "dosis",
  "cantidad",
  "presentacion",
  "formato",
  "liquido",
  "polvo",
  "dias",
  "meses",
  "veces",
  "al",
  "por",
  "cada",
  "unos",
]);

/**
 * `true` cuando la frase solo habla del envase, la cantidad o el manejo.
 *
 * Un nombre de ingrediente o una funcion del cuerpo la salvan: "aporta
 * carvacrol" habla de composicion pero nombra el compuesto, y de ahi si sale un
 * beneficio. "Rinde 393 porciones por frasco" no tiene nada de eso.
 */
/**
 * Palabras que no inclinan la balanza para ningun lado: pronombres, conectores
 * y numeros escritos. Se ignoran al decidir si una frase tiene sustancia.
 */
const NEUTRAL_WORDS = new Set([
  "te",
  "me",
  "le",
  "les",
  "nos",
  "lo",
  "es",
  "son",
  "esta",
  "este",
  "esa",
  "ese",
  "sin",
  "mas",
  "muy",
  "ya",
  "si",
  "no",
  "como",
  "pero",
  "tambien",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "cien",
  "mil",
]);

export function isOnlyPackaging(value: string): boolean {
  const words = normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return false;
  const substantive = words.filter(
    (word) =>
      !/^\d+$/.test(word) &&
      !PACKAGING_WORDS.has(word) &&
      !GENERIC_WORDS.has(word) &&
      !NEUTRAL_WORDS.has(word),
  );
  return substantive.length === 0;
}

export function isAllGeneric(value: string): boolean {
  const words = normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return false;
  if (words.some((word) => /\d/.test(word))) return false;
  return words.every((word) => GENERIC_WORDS.has(word));
}
