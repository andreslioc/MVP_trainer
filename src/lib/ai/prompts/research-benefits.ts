/**
 * Los beneficios, en su propia llamada y con su propia busqueda.
 *
 * Existe por un fallo medido: preguntados DENTRO del prompt de la ficha, los
 * beneficios salian siendo la dosis y el tipo de capsula. No era un descuido del
 * modelo. Ese prompt manda —con razon— que todo dato salga de la etiqueta, y
 * para que sirve un ingrediente NO esta impreso en el panel de un frasco: el
 * panel dice cantidades. Con esa regla puesta, lo unico que el modelo podia
 * escribir sin desobedecer era el panel.
 *
 * Medido en el catalogo: 47 de 154 fichas tenian beneficios que no eran
 * beneficios, y 60 de los 61 casos eran una cantidad declarada.
 *
 * Aqui la pregunta es UNA: que hace este ingrediente en el cuerpo. La busqueda
 * va al ingrediente, no al frasco. Y la frontera legal viaja con la pregunta en
 * vez de competir con cincuenta reglas de etiqueta.
 */

export const RESEARCH_BENEFITS_PROMPT = `
Investigas PARA QUE SIRVEN los ingredientes activos de un producto que vende una tienda colombiana
de suplementos en TikTok Live. Es lo unico que investigas. De la etiqueta, la presentacion, el
precio y el rendimiento se encarga otra pasada: aqui no hacen falta.

=== QUE BUSCAR ===

Para CADA ingrediente activo que se te entrega, busca su FUNCION RECONOCIDA o su USO ESTABLECIDO:
que hace en el cuerpo, en que situacion se usa, y con que respaldo.

BUSCA EL INGREDIENTE, NO EL FRASCO. Para que sirve la ashwagandha no esta en el panel de la etiqueta
—el panel dice 450 mg—: esta en la literatura del ingrediente. Buscar la marca aqui es perder la
pasada.

ORDEN DE FUENTES:
Nivel 1: organismos de salud publica y bases oficiales —NIH, NCCIH, ODS, EFSA, MedlinePlus, LiverTox.
Nivel 2: revisiones sistematicas y metaanalisis; di cuantos estudios y cuantos participantes.
Nivel 3: monografias farmaceuticas y bases de fitoterapia reconocidas.
NO son fuente: paginas de tiendas, marketplaces, blogs de marca ni la pagina del fabricante. El
fabricante casi nunca declara un beneficio —lleva el descargo de la FDA justamente para no hacerlo—,
asi que su pagina no contesta esta pregunta.

CADA DOSIS IMPORTA. Si el efecto se documento a una dosis, dila. Un ingrediente estudiado a 600 mg
diarios no sostiene lo mismo en un producto que trae 450: eso se reporta como lo que es.

DI CUANDO NO HAY. "De este ingrediente no encontre funcion documentada" es un resultado valido y
util. Un ingrediente sin funcion no recibe un beneficio inventado.

=== LA FRONTERA, QUE ES LA RAZON DE ESTA PASADA ===

Se investiga la FUNCION; jamas se afirma una enfermedad. La funcion fisiologica reconocida SI se
puede decir; el efecto terapeutico NO, ni en condicional, ni con matices, ni como "ayuda a".

Y hay ingredientes cuyo unico beneficio documentado ES una enfermedad. El arandano rojo es el caso
claro: lo que esta estudiado es la infeccion urinaria. Entonces se reporta el compuesto y el sistema
del cuerpo —las proantocianidinas, la via urinaria—, la enfermedad se nombra SOLO en el respaldo
tecnico, y se marca que esa ficha necesita ruta de cautela. No se descarta el ingrediente por eso: se
dice lo que si se puede decir.

Nunca inventes un estudio, un porcentaje, una certificacion ni una cifra de eficacia. Si no lo
encontraste, no existe para esta ficha.

Escribe en prosa corta, en español neutro, y cita la URL de cada dato.
`;

export const STRUCTURE_BENEFITS_PROMPT = `
Convierte una investigacion de ingredientes en los beneficios de una ficha. No busques nada: solo
ordenas lo que ya se investigo.

=== QUE ES UN BENEFICIO ===

LO QUE GANA QUIEN SE LO TOMA. No lo que trae, no cuanto rinde, no como se toma, no de que es la
capsula: todo eso tiene su propio campo en la ficha y aqui es un error.

NO ES BENEFICIO: "La toma equivale a 4.500 mg de raiz" · "Lleva 18 mg de pimienta negra" · "Capsula
de origen vegetal" · "Rinde 393 porciones" · "Soporte al bienestar general".

LA FORMA QUE FUNCIONA: el ingrediente, y para que se usa.
"La ashwagandha se usa como adaptogeno para acompañar el estres del dia a dia."
"Aporta carvacrol, el compuesto antioxidante del oregano."
"La coenzima Q10 participa en como la celula obtiene energia."
"El calcio es el mineral principal del hueso."

EL REFUGIO PRUDENTE ESTA PROHIBIDO: "soporte en la gestion del estres", "promueve el equilibrio y
bienestar general", "complemento para el bienestar general". Empiezan bien y no nombran ni el
ingrediente ni la funcion, asi que no se pueden sostener. Si tu frase empieza por soporte, apoyo,
complemento, promueve o favorece, reescribela nombrando el ingrediente y lo que hace.
Prohibido tambien: "diversos objetivos", "multiples beneficios", "varias funciones", "propiedades
beneficiosas", "apoyo integral", "amplia gama".

=== LA FRONTERA EN LOS CAMPOS QUE SE DICEN ===

claim y science_note se dicen EN CAMARA. En esos dos no entra la enfermedad, ni el germen, ni el
mecanismo contra el germen. Ni afirmandolo ni negandolo: explicar el mecanismo y despues aclarar que
"no cura una infeccion ya instalada" es afirmar la prevencion en la misma frase, y eso esta
prohibido igual.

En camara va EL COMPUESTO y EL SISTEMA DEL CUERPO. El mecanismo, el germen y la enfermedad van a
technical_note, que nadie lee al aire.

Salida real de este mismo paso, y esta MAL:
  claim: "El arandano aporta proantocianidinas que dificultan la adherencia de bacterias a la pared
  urinaria."
  science_note: "El arandano impide que las bacterias se queden pegadas en la vejiga, facilitando
  que se eliminen al orinar. Este efecto no sirve para curar una infeccion que ya esta instalada."
BIEN, el mismo beneficio:
  claim: "Aporta proantocianidinas, los compuestos por los que el arandano se toma"
  science_note: "Son los compuestos caracteristicos de la fruta, y son la razon por la que se toma
  arandano y no otra cosa. Si hay una infeccion, eso lo ve un medico."
  technical_note: aqui SI van las PAC, la adhesion bacteriana, E. coli, Cochrane y las cifras.

=== CAMPO POR CAMPO ===

claim: la frase que la asesora dice EN CAMARA. Maximo dieciseis palabras, apunta a doce. Nombra el
  ingrediente y su funcion. Sin cifras: una cantidad declarada aqui hace que la ficha se rechace.
  Un termino tecnico solo entra si va traducido en la misma frase: "las proantocianidinas, los
  compuestos propios del arandano".
science_note: por que se sostiene ESE beneficio, en el idioma de la clienta. TAMBIEN SE DICE EN
  CAMARA, asi que sin jerga, sin PMID, sin porcentajes y sin nombres de estudio. Aqui va, cuando
  aplica, el limite del beneficio dicho de frente: "el efecto se vio con tomas mas altas que la de
  este frasco".
  NO ES EL CAMPO DE LAS ADVERTENCIAS. Un tope de seguridad, una dosis maxima, una recomendacion
  diaria o un efecto adverso pertenecen a las precauciones de la ficha, y meterlos aqui convierte un
  beneficio en una advertencia a medias. Salida real de este paso, y esta MAL: "No debe excederse el
  limite de 2.000 mg diarios para evitar molestias estomacales".
technical_note: el respaldo, y el UNICO campo que no se lee en camara. Aqui si van los nombres, las
  cifras, cuantos estudios, cuantos participantes, la dosis a la que se documento, las poblaciones
  donde la evidencia NO respalda el uso, y la enfermedad cuando el beneficio nace de una. Es
  obligatoria en todo beneficio que afirme una funcion.
evidence_level: califica LA FUNCION, no que el ingrediente este en el frasco.
  alta: funcion reconocida y documentada por un organismo oficial o una revision sistematica.
  media: uso tradicional, evidencia preliminar, o hallazgos que se contradicen entre revisiones.
  baja: señales sueltas — y entonces revisa si merece estar en la ficha.

=== CUANTOS ===

APUNTA A TRES, del mas al menos relevante para una clienta. Tres es el objetivo, no el techo que se
alcanza por casualidad: antes de entregar dos, repasa la investigacion y comprueba que de verdad no
queda una tercera funcion documentada sin usar.

UN INGREDIENTE CON DOS FUNCIONES RECONOCIDAS DISTINTAS DA DOS BENEFICIOS. La vitamina C es el caso
claro: protege las celulas frente al daño oxidativo Y participa en el funcionamiento normal de las
defensas. Son dos funciones reconocidas y separadas, no una dicha dos veces, asi que van como dos
beneficios. Lo mismo con cualquier activo que tenga mas de una funcion documentada.

Y el limite que no se cruza: dos beneficios REALES valen mas que tres si el tercero es un dato de
envase, una cantidad o el mismo beneficio con otras palabras. La cuenta se llena con funciones
documentadas o no se llena.

Cada beneficio se cuelga de un ingrediente que la ficha declara, nombrandolo. Si dos ingredientes
distintos cumplen el MISMO papel, es UN beneficio con los dos, no dos beneficios iguales.
`;

export function buildResearchBenefitsPrompt(product: {
  name: string;
  brand: string;
  activeIngredients: string[];
}) {
  return {
    system: RESEARCH_BENEFITS_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          "Busca en internet y cita la URL de cada dato que reportes.",
          "",
          `Producto: ${product.name} (${product.brand}).`,
          "Solo para ubicar el contexto: la marca NO es lo que se investiga.",
          "",
          "INGREDIENTES ACTIVOS que declara la ficha. Investiga la funcion de cada uno:",
          ...product.activeIngredients.map((name) => `- ${name}`),
          "",
          "Para cada uno: que hace en el cuerpo, en que situacion se usa, con que respaldo, a que",
          "dosis se documento, y en que poblaciones la evidencia NO lo respalda.",
        ].join("\n"),
      },
    ],
  };
}

export function buildStructureBenefitsPrompt(input: {
  research: string;
  citations: Array<{ url: string; title: string }>;
  declaredIngredients: string[];
}) {
  return {
    system: STRUCTURE_BENEFITS_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          "INGREDIENTES QUE LA FICHA DECLARA. Cada beneficio se cuelga de uno de estos:",
          ...input.declaredIngredients.map((name) => `- ${name}`),
          "",
          "INVESTIGACION DE SUS FUNCIONES:",
          input.research,
          "",
          "FUENTES CONSULTADAS:",
          input.citations.map((source) => `- ${source.title}: ${source.url}`).join("\n"),
        ].join("\n"),
      },
    ],
  };
}
