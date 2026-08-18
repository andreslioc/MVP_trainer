---
description: Uso de la API de Gemini, parametros, razonamiento y persistencia de uso
paths:
  - "src/lib/ai/**"
  - "src/server/**"
---

# Gateway de IA

- El proveedor se habla **solo** desde `src/lib/ai/gateway.ts`, por REST con `fetch`. No hay SDK.
  Un gate cuenta el header `x-goog-api-key` y falla si aparece en mas de un archivo.
- Los tipos de la costura son **neutrales**: `AiProviderRequest` y `AiProviderResponse` no contienen
  nada especifico del vendor. Si un tipo del proveedor cruza hacia `src/server/`, la costura dejo de
  serlo — que es exactamente como estaba antes de migrar de proveedor.
- Autenticacion por header `x-goog-api-key`. Un `Authorization: Bearer` con la misma llave devuelve
  401 UNAUTHENTICATED.
- **Modelo por defecto en todos los call sites: `AI_MODEL_DEFAULT`.** Ningun call site escribe un id
  de modelo literal; viven en configuracion.
- `AI_MODEL_SMALL` esta declarado y **no se usa todavia**. La regla es empezar un tier arriba y bajar
  solo con un eval del golden set que lo respalde.
- **Razonamiento:** `thinkingConfig.thinkingBudget` sale del esfuerzo. `low` es 0 y es una decision
  medida, no una intuicion: una clasificacion de intencion gastaba 983 tokens de razonamiento para
  producir 6 de salida, y con presupuesto 0 acierta igual en 29 tokens totales. Donde la salida tiene
  forma fija y respuesta correcta, pensar no compra nada.
- **Salida estructurada:** `responseJsonSchema` recibe el JSON Schema que emite `z.toJSONSchema()`
  tal cual. El proveedor acepta `$schema` y `additionalProperties`; no hay que sanear nada. Nunca
  pedir JSON en prosa.
- **Rechazo:** `finishReason` SAFETY / PROHIBITED_CONTENT / BLOCKLIST / SPII y
  `promptFeedback.blockReason` se normalizan a `refusal`. Se revisa **antes** de leer el texto: en
  este dominio la respuesta bloqueada suele ser sobre embarazo, medicamentos o enfermedad, y usarla
  igual seria el fallo que la ruta de rechazo existe para evitar.
- **Timeout de 60 s por llamada.** Sin el, una respuesta que no llega cuelga la peticion para
  siempre. El tier gratuito devuelve 503 con frecuencia; medido, 11 de 14 peticiones seguidas.
- Toda llamada escribe una fila en `llm_calls` con el uso reportado por el proveedor, nunca estimado.
  Los tokens de razonamiento cuentan como salida, o el ledger subestima justo lo que mas gasta.
- El costo esta en cero porque el tier es gratuito. La tabla de precios se conserva: el dia que se
  pase a un plan pago el unico cambio es esa tabla, y el historico ya existe.
