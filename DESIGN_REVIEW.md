# Auditoría: Training Simulator

Revisado contra: sección 4.1 suministrada por el usuario y blueprint canónico del proyecto  
Fecha: 2026-08-24  
Veredicto: **cumple el núcleo, pero no está 100% acorde con todo lo prometido**.

## Capturas realizadas

| Vista | Escritorio 1280 | Tablet 768 | Móvil 375 |
|---|---|---|---|
| Inicio de Training | `screenshots/review-training-launcher-desktop-1280.png` | `screenshots/review-training-launcher-tablet-768.png` | `screenshots/review-training-launcher-mobile-375.png` |
| Respuesta evaluada | `screenshots/review-training-evaluated-desktop-1280.png` | `screenshots/review-training-evaluated-tablet-768.png` | `screenshots/review-training-evaluated-mobile-375.png` |
| Preparación del simulacro | `screenshots/review-training-simulacro-desktop-1280.png` | `screenshots/review-training-simulacro-tablet-768.png` | `screenshots/review-training-simulacro-mobile-375.png` |

Las insignias flotantes negras/rojas visibles en algunas capturas pertenecen al indicador de
desarrollo de Next.js y no forman parte de la interfaz de producción.

## Cumplimiento del texto

| Promesa | Estado | Evidencia |
|---|---|---|
| Seleccionar un producto real del catálogo o página web | **Parcial** | Solo se ofrecen fichas reales y verificadas del Knowledge Hub (`src/server/training/questions.ts:180-197`), pero la asesora elige el producto (`training-launcher.tsx:64-83`); el sistema no lo selecciona automáticamente y Training no importa directamente desde una página web. |
| Generar preguntas frecuentes y objeciones probables | **Parcial** | El prompt exige seis preguntas realistas y usa FAQ/objeciones de la ficha (`generate-questions.ts:23-38`), pero la validación solo obliga cuatro intenciones distintas (`questions.ts:134-151`). Una tanda válida puede no incluir ninguna pregunta de intención `objecion`; tampoco existe una señal de frecuencia que pruebe que sean “las más frecuentes”. |
| Clasificar por dificultad básica, intermedia y difícil | **Cumple** | El contrato define las tres dificultades (`schema.ts:29-33`) y rechaza cualquier tanda que no tenga exactamente dos de cada una (`questions.ts:134-151`). La dificultad se muestra en cada pregunta (`training/[sessionId]/page.tsx:72-83`). |
| Clasificar por intención: información, comparación, precio, confianza, uso, compra, seguridad y objeción | **Cumple** | Las ocho intenciones del documento existen literalmente en el enum (`schema.ts:19-28`), se persisten por pregunta y se muestran durante la práctica. |
| Responder como si estuviera en TikTok Live | **Cumple** | La práctica guiada pide responder “como si estuvieras en vivo” (`training-response-form.tsx:71-90`). Además hay un simulacro más fiel con cámara, chat automático y respuesta por voz (`simulator-client.tsx:172-193,198-264`). |
| La IA muestra fortalezas, errores y una versión mejorada | **Parcial** | Sí entrega nueve puntuaciones con motivo, feedback global y versión mejorada (`training-response-form.tsx:108-147`). Sin embargo, el contrato solo exige `feedback` libre (`evaluate-answer.ts:19-27`): no garantiza bloques explícitos y separados de “Fortalezas” y “Errores”. |
| Registrar progreso por asesor y temas a reforzar | **Parcial, con una brecha importante** | Las sesiones y respuestas quedan ligadas al asesor y persisten evaluación (`schema.ts:176-210`). El dashboard solo muestra cantidades de prácticas y respuestas (`dashboard.ts:66-74`; `app/page.tsx:50-60`). No calcula evolución por dimensión/intención/producto ni presenta temas que deben reforzarse. |

Resultado estricto: **3 promesas cumplen y 4 cumplen parcialmente**. Ninguna de las cuatro parciales
debería anunciarse en lenguaje absoluto sin completar la implementación o ajustar el texto.

## Debe corregirse

1. **Progreso y refuerzo**: falta la parte de mayor impacto respecto al documento. Se necesita una
   vista por asesora que agregue puntuaciones por dimensión, intención y producto, muestre evolución
   temporal y priorice los temas con menor desempeño.
2. **Alinear quién selecciona el producto**: decidir una sola verdad. Si debe elegirlo el sistema,
   implementar selección automática/aleatoria con criterio pedagógico. Si debe elegirlo la asesora,
   cambiar el documento a “la asesora selecciona una ficha verificada”.
3. **Garantizar objeciones si se prometen**: la tanda debería exigir al menos una intención
   `objecion` y definir de dónde sale “frecuente” (FAQ de la ficha, Live Intelligence o frecuencia
   persistida). Hoy “realista” no equivale a “frecuente”.
4. **Hacer explícitas fortalezas y errores**: separar ambos campos en el contrato estructurado y en
   la interfaz, en lugar de depender de que el feedback libre los mencione.

## Debería corregirse

1. **Control móvil del simulacro**: “Preguntas que aparecerán” y su campo numérico quedan apretados
   en una sola línea en `review-training-simulacro-mobile-375.png`. Conviene apilar el campo debajo
   de la etiqueta (`simulator-client.tsx:234-244`).
2. **Resultados móviles extensos**: las nueve dimensiones son legibles y no desbordan, pero generan
   una página muy larga en `review-training-evaluated-mobile-375.png`. Un resumen inicial con las
   2 fortalezas y 2 prioridades principales haría el resultado más accionable sin ocultar el detalle.

## Lo que funciona bien

- La jerarquía visual es clara y consistente en los tres tamaños; no se observó scroll horizontal
  ni colapso del layout.
- Los controles principales mantienen tamaño táctil, estados deshabilitados y foco global visible.
- La práctica está aislada por asesora, persiste respuestas y permite recorrer toda la tanda.
- La generación y evaluación están limitadas a fichas verificadas y aplican las reglas de cautela de
  suplementos.
- El simulacro con cámara/chat/voz supera la fidelidad mínima del texto para “responder como en un
  TikTok Live”.

## Verificación ejecutada

- Tres flujos E2E: selección/inicio, navegación por toda la tanda y respuesta con nueve dimensiones
  más versión mejorada: **3/3 aprobados**.
- Pruebas focalizadas de evaluación, simulacro y reproductor de chat: **32/32 aprobadas**.

