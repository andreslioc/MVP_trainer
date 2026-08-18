---
name: add-ai-call-site
description: Usar al agregar cualquier llamada nueva al modelo en Super Store Sales OS — una generacion, una clasificacion, una evaluacion o un analisis. Cubre el prompt versionado, el esquema de Zod, el paso por el gateway, la persistencia en llm_calls, el presupuesto de razonamiento segun esfuerzo y la revision de finishReason antes de leer el texto.
---

# Agregar un call site de IA

## Cuando usarla

Cada vez que aparece una necesidad nueva de generar, clasificar, evaluar o extraer con el modelo.

## Pasos

1. Crea el prompt en `src/lib/ai/prompts/<nombre>.ts` como funcion pura que retorna los bloques
   `system` y `messages`. Ordena **lo estable primero**: instrucciones, ficha del producto, reglas
   comerciales. Lo volatil (la pregunta de la clienta, la respuesta de la asesora) va despues del
   ultimo breakpoint de cache.
2. El proveedor cachea el prefijo de forma implicita: no hay breakpoint que declarar. Ordenar lo
   estable primero sigue importando, porque de eso depende que el prefijo se repita entre llamadas.
   `cacheReadTokens` en `llm_calls` dice si esta ocurriendo; si es siempre 0, algo volatil se colo
   al principio del prompt.
3. Registra el prompt en la tabla `prompts` con nombre y version, para que una traza pueda nombrar el
   prompt exacto que la produjo.
4. Define el esquema de salida en `src/lib/ai/schemas.ts` con Zod. Plano y con pocos campos
   requeridos: el anidamiento profundo degrada la calidad de forma medible.
5. Llama **solo** a `src/lib/ai/gateway.ts`. No hables con el proveedor directamente — hay una prueba que
   cuenta los archivos que lo importan y espera exactamente uno.
6. Elige `effort` por requisito de producto: `low` o `medium` en el Live Copilot porque ahi la
   latencia es el producto; `high` (el default) en Simulator y Live Intelligence. `effort` mapea al
   presupuesto de razonamiento, y `low` es 0: en una clasificacion medida, pensar costaba 983 tokens
   para producir 6 y no mejoraba la respuesta.
7. Pasa un `purpose` unico. Es la columna por la que se lee el costo por feature en `llm_calls`.
8. **Revisa `finishReason` antes de leer el texto.** Un bloqueo llega con HTTP 200: el gateway
   normaliza SAFETY, PROHIBITED_CONTENT, BLOCKLIST y SPII a `refusal` y expone `refusalCategory`.
   En este dominio la respuesta bloqueada suele ser sobre embarazo, medicamentos o enfermedad, asi
   que usarla igual seria justo el fallo que esa ruta existe para evitar.
9. Escribe una prueba en `tests/unit/` que inyecte un cliente falso: el camino feliz, un rechazo, y
   un `parsedOutput` nulo.

## Verificar

```bash
pnpm test tests/unit/sdk-single-import.test.ts   # expect: exit 0 — un solo archivo importa el SDK
pnpm test tests/unit                             # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                   # expect: exit 0
```

## No hacer

- No escribir un id de modelo en el call site. Van en `src/lib/ai/config.ts`, leidos de env.
- No escribir `budget_tokens`: esta eliminado en Opus 5 y devuelve 400.
- No poner `effort` en el nivel superior. Va dentro de `output_config`.
- No usar `output_format` (deprecado) ni pedir JSON en prosa. Se usa `messages.parse()` con
  `zodOutputFormat`.
- No hacer prefill de un mensaje assistant: devuelve 400 en Opus 5.
- No estimar tokens ni costo contando caracteres. Se persiste lo que reporta el proveedor.
- No bajar a `AI_MODEL_SMALL` sin un eval del golden set que lo respalde.
- No dejar que el modelo aporte informacion que no este en `products` ni en `commercial_rules`.
