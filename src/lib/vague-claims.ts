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
  // El publico tiene su propio campo (`audience`). Aqui solo evita que
  // "complemento para el bienestar general en adultos" se salve por "adultos":
  // una frase hecha de genericas mas un publico sigue sin decir nada.
  "adulto",
  "adultos",
  "personas",
  "apoyo",
  "apoya",
  "soporte",
  "soporta",
  "ayuda",
  "contribuye",
  // Los verbos del envoltorio prudente. Solo pesan cuando TODO lo demas es
  // generico: "favorece la funcion muscular" pasa —nombra la funcion—, y
  // "promueve el equilibrio y bienestar general" no, que es una salida real del
  // modelo y no dice de que ingrediente ni para que.
  "promueve",
  "promover",
  "favorece",
  "favorecer",
  "fomenta",
  "fomentar",
  "potencia",
  "potenciar",
  "optimiza",
  "optimizar",
  "refuerza",
  "reforzar",
  "brinda",
  "ofrece",
  "proporciona",
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
  // De que esta hecha la capsula. Es dato de envase —y de alergeno, y por eso
  // su sitio son precautions— pero jamas un beneficio: "capsula de origen
  // vegetal" se colaba porque "origen" y "vegetal" no estaban en ningun
  // vocabulario.
  "origen",
  "vegetal",
  "vegetales",
  "vegetariana",
  "vegetariano",
  "gelatina",
  "celulosa",
  "recubrimiento",
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

/**
 * Articulos y preposiciones. No son palabras "neutras" con significado propio
 * como las de arriba: son el pegamento de cualquier frase en español, y una
 * regla que las cuente como sustancia no puede rechazar nada.
 */
const CONNECTORS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "a",
  "en",
  "con",
  "para",
  "por",
  "y",
  "o",
  "que",
  "su",
  "sus",
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
  // Los conectores se ignoran, igual que en `isOnlyPackaging`. Sin esto un
  // "para" o un "en" desarmaban la regla entera: "complemento para el bienestar
  // general" pasaba, y "soporte al bienestar general" —el ejemplo del docstring
  // de este modulo— solo se rechazaba porque "al" estaba, por casualidad, en el
  // vocabulario de envase.
  const decisivas = words.filter((word) => !NEUTRAL_WORDS.has(word) && !CONNECTORS.has(word));
  if (decisivas.length === 0) return false;
  return decisivas.every((word) => GENERIC_WORDS.has(word));
}

/**
 * Unidades con las que se declara una cantidad. Si una frase trae un numero
 * seguido de una de estas, esta declarando composicion, dosis o rendimiento.
 */
const QUANTITY_UNITS = [
  "mg",
  "mcg",
  "ug",
  "g",
  "gr",
  "gramo",
  "gramos",
  "kg",
  "ml",
  "l",
  "onza",
  "onzas",
  "ui",
  "iu",
  // La misma unidad escrita en palabras. "Aporta 1.000 unidades internacionales
  // de vitamina D3" es exactamente el mismo error que "1.000 UI" y se colaba
  // por la puerta de al lado.
  "unidad",
  "unidades",
  "capsula",
  "capsulas",
  "tableta",
  "tabletas",
  "softgel",
  "softgels",
  "gomita",
  "gomitas",
  "gota",
  "gotas",
  "sobre",
  "sobres",
  "porcion",
  "porciones",
  "toma",
  "tomas",
  "dia",
  "dias",
  "semana",
  "semanas",
  "mes",
  "meses",
  "minuto",
  "minutos",
  "vez",
  "veces",
] as const;

const QUANTITY_PATTERN = new RegExp(
  `\\d[\\d.,]*\\s*(?:%|${QUANTITY_UNITS.join("|")})(?![\\p{L}])`,
  "u",
);

/**
 * `true` cuando la frase declara una CANTIDAD: composicion, dosis o rendimiento.
 *
 * Es el agujero por el que se colaban los beneficios que no eran beneficios. La
 * regla anterior —`isOnlyPackaging`— exige que TODAS las palabras sean de envase,
 * asi que bastaba nombrar el ingrediente para escapar; y nombrar el ingrediente
 * es justo lo que la regla de concrecion pide. Las dos se anulaban, y por ahi
 * pasaban "la toma diaria equivale a 4.500 mg de raiz de ashwagandha" y "lleva
 * 18 mg de pimienta negra al 95% de piperina": ciertos, utiles, y ninguno
 * contesta para que sirve el producto.
 *
 * La cantidad tiene su campo —`active_ingredients` para lo que trae, `usage_mode`
 * para cuanto se toma, los diferenciales para lo que rinde—. En un beneficio es
 * el sintoma de que no se busco la funcion del ingrediente.
 *
 * `science_note` SI puede llevar cifras: ahi la cantidad explica por que el
 * beneficio se sostiene, que es su trabajo. Esto se mide solo sobre `claim`.
 */
export function hasDeclaredQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(normalize(value));
}
