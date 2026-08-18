---
description: Uso del SDK de Anthropic, parametros de la API, caching y persistencia de uso
paths:
  - "src/lib/ai/**"
  - "src/server/copilot/**"
  - "src/server/training/**"
  - "src/server/recordings/**"
  - "src/server/llm-calls.ts"
---

# Capa de IA

## El gateway es el unico import

- `@anthropic-ai/sdk` y `@anthropic-ai/sdk/helpers/zod` se importan **solo** en
  `src/lib/ai/gateway.ts`. Cualquier otro modulo importa del gateway. Hay una prueba que lo verifica
  contando archivos, no lineas: `tests/unit/sdk-single-import.test.ts`.
- Los ids de modelo y los precios viven en `src/lib/ai/config.ts`, leidos de env. **Jamas un id de
  modelo en un call site.**
- Las funciones del gateway aceptan un cliente opcional. Las pruebas inyectan un cliente falso; por
  eso ningun gate del §9 necesita `ANTHROPIC_API_KEY`.

## Parametros — exactos, no aproximados

- **Modelo por defecto en todos los call sites: `claude-opus-5`** (contexto 1M, USD 5/25 por MTok).
- `claude-haiku-4-5` esta declarado y **no se usa todavia**. La regla es empezar un tier arriba y
  bajar solo con un eval que lo respalde. El candidato a bajar es el clasificador de intencion.
- `thinking: { type: "adaptive" }`. **`budget_tokens` esta eliminado en Opus 5 y devuelve 400** — no
  se escribe en ningun lado.
- Profundidad: `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`, **dentro de
  `output_config`**, nunca top-level. Default `high`. El Live Copilot usa `low` o `medium`: ahi la
  latencia es el requisito de producto.
- Structured output: `client.messages.parse()` con `zodOutputFormat(Schema)` pasado como
  `output_config: { format: zodOutputFormat(Schema) }`. **Nunca** el parametro `output_format`
  (deprecado) y **nunca** pedir JSON en prosa.
- `response.parsed_output` es `null` si el parseo fallo. Se afirma o se guarda; no se asume.
- **El prefill de mensaje assistant devuelve 400 en Opus 5.** No existe como tecnica aqui.
- `max_tokens`: ~16000 sin streaming, ~64000 con streaming, ~256 para clasificacion.
- Streaming obligatorio donde una persona lee la salida y para cualquier `max_tokens` grande. Se
  consume con `.finalMessage()`.

## Refusals — este dominio los necesita

- Suplementos mas preguntas de embarazo, medicamentos o enfermedad pueden disparar
  `stop_reason: "refusal"` con **HTTP 200** y un `stop_details.category`.
- Se activan `betas: ["server-side-fallback-2026-07-01"]` y `fallbacks: "default"`.
- **Siempre se revisa `stop_reason` antes de leer `content`.** Un refusal no leido se convierte en una
  respuesta vacia que la asesora lee en camara.

## Prompt caching

- `cache_control: { type: "ephemeral" }` sobre los bloques `system`.
- Orden de render: `tools` → `system` → `messages`. Lo estable primero (instrucciones, ficha del
  producto, reglas comerciales), lo volatil despues del ultimo breakpoint.
- Prefijo minimo cacheable ~1024 tokens. Se verifica con `usage.cache_read_input_tokens`.
- Un timestamp o un id de request dentro del prefijo estable invalida todo lo que sigue. No se ponen.

## Costo

- Cada llamada escribe una fila en `llm_calls` con el uso **reportado por el proveedor**:
  `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`,
  `latency_ms`, `finish_reason`.
- El costo se calcula con `MODEL_PRICING_USD_PER_MTOK` de `src/lib/ai/config.ts`, nunca contando
  caracteres.
- Cada fila es atribuible a un `advisor_id` y a un `purpose`. Sin eso no hay economia unitaria.
- `prompts` guarda nombre, version y cuerpo activo para que una traza pueda nombrar el prompt exacto
  que la produjo.
