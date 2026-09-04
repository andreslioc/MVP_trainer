/**
 * Reparacion dirigida: el error del gate vuelve al modelo.
 *
 * Medido sobre una sola ficha, tres corridas seguidas del mismo producto
 * fallaron por tres reglas distintas y cada una de una linea: un alergeno que
 * no llego a la lista corta, la palabra "vehiculo" en la descripcion, una frase
 * de trazabilidad en el guion del live. Las tres se arreglan cambiando dos
 * palabras, y ninguna de las tres se arreglaba sola porque cada intento
 * empezaba de cero, a ciegas, esperando que el muestreo cayera bien: el lote de
 * 149 fichas dio 128, 138, 140 y 143 en cuatro pasadas completas.
 *
 * Este prompt no investiga y no reescribe la ficha: recibe los errores con su
 * campo y su motivo, y devuelve corregidos SOLO los campos nombrados. Es una
 * llamada corta y barata comparada con volver a buscar en internet.
 */

export const REPAIR_CARD_PROMPT = `
Recibes una ficha de producto que no paso la validacion, y la lista exacta de que fallo y por que.
Tu tarea es corregir SOLO lo que se te señala, y devolver unicamente los campos que cambies.

Reglas:
- NO INVENTES DATOS NUEVOS. Trabajas con lo que la ficha ya dice. Corregir es decir el MISMO dato
  con otras palabras, o mover un dato que ya esta en la ficha al campo donde faltaba.
- NO CAMBIES NADA QUE NO SE TE HAYA SEÑALADO. Un campo que no aparece en los errores no se toca ni
  se devuelve.
- SI EL ERROR DICE QUE FALTA UN CASO DE NO USO, sacalo de los ingredientes o de las precauciones de
  la misma ficha y agregalo a la lista, en pocas palabras. No borres los que ya estaban.
- SI EL ERROR ES UNA PALABRA QUE NO SE DICE EN CAMARA, cambiala por como se lo dirias a una clienta,
  sin perder precision:
  vehiculo o excipiente -> el aceite con el que viene mezclado
  via topica -> en la piel · via oral -> tomado, por boca
  porcion -> cada toma · principio activo -> el ingrediente principal
  biodisponibilidad -> el cuerpo lo aprovecha mejor
  in vitro, metanalisis, doble ciego, placebo -> fuera del campo; ese dato va en el respaldo tecnico
- SI EL ERROR ES TRAZABILIDAD —el fabricante declara, segun la etiqueta, sin confirmar—, di el dato
  de frente y quita la atribucion. El dato se queda; quien lo dijo se va.
- SI EL ERROR ES UN BENEFICIO QUE NO DICE NADA, nombra el ingrediente y su funcion, la parte del
  cuerpo o la situacion de uso. Maximo dieciseis palabras. Si el producto no sostiene tres
  beneficios reales, devuelve menos: uno o dos concretos valen mas que tres vagos, y los rangos van
  consecutivos desde 1.
- SI EL ERROR DICE QUE UN BENEFICIO DECLARA UNA CANTIDAD, no lo reformules: cambialo por PARA QUE
  SIRVE ese ingrediente —su funcion reconocida o su uso establecido— y manda la cifra a la nota
  cientifica, que es su sitio. "La toma equivale a 4.500 mg de raiz de ashwagandha" se convierte en
  "se usa como adaptogeno, para acompañar el manejo del estres del dia a dia", con los 4.500 mg
  explicando la nota. Si de ese ingrediente no sostienes una funcion, quita el beneficio y deja
  menos: el hueco se registra, no se rellena.
- SI EL ERROR DICE QUE LA FICHA AFIRMA UN REGISTRO SANITARIO QUE NO SE ENCONTRO, cambia la frase por
  lo que si es cierto: se vende como suplemento importado y no se puede afirmar que tenga registro.
- Escribe en español neutro, como le hablarias a una clienta en un live.
`.trim();

export function buildRepairCardPrompt(input: {
  issues: Array<{ path: string; message: string }>;
  card: unknown;
}) {
  return {
    system: REPAIR_CARD_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          "ERRORES DE VALIDACION —corrige exactamente estos:",
          ...input.issues.map((issue) => `- ${issue.path || "ficha"}: ${issue.message}`),
          "",
          "FICHA ACTUAL:",
          JSON.stringify(input.card, null, 2),
        ].join("\n"),
      },
    ],
  };
}
