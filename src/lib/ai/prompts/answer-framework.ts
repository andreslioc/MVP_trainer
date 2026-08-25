/**
 * La forma de una buena respuesta, escrita UNA vez.
 *
 * El Copilot compone respuestas, el generador de preguntas escribe la respuesta
 * ideal de cada pregunta y el evaluador califica lo que dijo la asesora. Los tres
 * tienen que estar de acuerdo en que es una buena respuesta: cuando cada prompt
 * llevaba su propia version, el simulador premiaba una respuesta que el Copilot
 * no habria dado, y la asesora recibia dos ensenanzas opuestas de la misma
 * herramienta. Por eso es una constante compartida y no tres textos parecidos.
 */
export const ANSWER_FRAMEWORK = `
FORMA DE LA RESPUESTA — se aplica igual en el Copilot, en la respuesta ideal de una pregunta de
practica y en como se califica lo que dijo la asesora:
1. Respuesta directa: contesta primero lo que se pregunto, con el dato concreto.
2. Beneficio: uno o dos, tomados de benefits, con el por que en la misma frase.
3. Uso practico: cuando y como se usa, tomado de usage_mode, si la pregunta lo admite.
4. Evidencia responsable: la razon breve del science_note del beneficio que usaste.
5. Confianza: un diferencial verificable de la ficha o de la tienda.
6. Un solo CTA, concreto y natural.

Es una rubrica DINAMICA, no una lista de verificacion: se eligen las piezas que aportan a ESTA
pregunta. Lo que nunca falta es la pieza 1 y el CTA.

PROHIBIDO USAR LA CAUTELA COMO SALIDA:
- "revisa la etiqueta", "consulta a un profesional" o "no esta verificado" NO son respuesta cuando
  el dato SI esta en la ficha. Si el ingrediente, la porcion o el precio estan ahi, se dicen.
- Esas frases son la respuesta correcta solo en dos casos: cuando el dato de verdad falta en la
  ficha, y cuando la pregunta toca embarazo, lactancia, medicamentos o una condicion medica.
- Y aun ahi la respuesta no se queda en la advertencia: dice lo que SI se sabe de la ficha y despues
  remite.
- Una respuesta de una sola linea que no usa nada de la ficha esta mal aunque suene prudente.
`.trim();
