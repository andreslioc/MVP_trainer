# Epic 02: Product Loop

> Training, Copilot y Live Intelligence cierran el ciclo y quedan desplegables con retencion.

| | |
|---|---|
| **Epic id** | `02-product-loop` |
| **Tasks** | `E2-T1` … `E2-T8` |
| **Depends on** | `01-foundation` |
| **Unlocks** | piloto de lanzamiento |
| **Parallel with** | ninguno; las tareas comparten contratos secuenciales del loop |

No necesitas leer `blueprint.md`. Lee `CLAUDE.md`, las reglas de IA/comunicacion/testing y la entrada
actual de `tasks.json`. Los clientes de IA y Deepgram de todos los gates son falsos.

---

## Stack y comandos

Next 16.3.1 · TypeScript 6.0.3 · Tailwind 4.3.3 · Drizzle/Postgres · Supabase Auth/Storage ·
Gemini REST · Deepgram REST · Vercel. Gestor `pnpm@11.22.0`; Node 24.19.0.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Gate | `pnpm typecheck && pnpm lint && pnpm test` |
| Test uno | `pnpm test <ruta>` |
| E2E | `pnpm test:e2e` |
| Supabase | `pnpm supabase:start` / `pnpm supabase:stop` |
| Build | `pnpm build` |

## Subarbol y contratos

```text
src/app/(app)/app/training/                 # preguntas y evaluacion
src/app/(app)/app/copilot/page.tsx          # entrada + streaming
src/app/(app)/app/intelligence/page.tsx     # upload, estados e insights
src/app/(app)/app/page.tsx                  # KPIs
src/app/api/{transcription-callback,cron/retention}/route.ts
src/components/copilot/answer-panel.tsx
src/lib/ai/prompts/                     # cuatro prompts del loop
src/lib/copilot/view-defaults.ts
src/server/training/                    # preguntas y evaluacion
src/server/copilot/                     # sesion, compose, orquestador, gate
src/server/recordings/                  # upload, transcripcion, analisis
src/server/insights.ts
tests/{fixtures,unit,integration,e2e}/
```

Contratos consumidos de Epic 01: `requireRole`, schema/cliente DB, gateway/structured output,
`products`, `commercial_rules` y ledger. Ningun modulo agrega conocimiento fuera de las dos tablas.

Convenciones que muerden: Express es default; maximo un CTA y un incentivo; refusal se trata antes
de content; ruta cautelosa siempre gana; callback y cron son idempotentes; nunca loggear texto de
clienta o transcripcion; no llamar proveedores reales desde verify.

---

## Tasks

### `E2-T1` — Generate Simulator questions

**Depends on:** `E1-T8` · **Priority:** p0

Genera preguntas desde una ficha y rechaza la tanda completa si la salida introduce claims externos.
El `advisor_id` siempre sale de la sesion verificada.

**Files:** `src/lib/ai/prompts/generate-questions.ts`, `src/server/training/questions.ts`,
`src/app/(app)/app/training/page.tsx`, `tests/unit/generate-questions.test.ts`, `tests/`.

**Acceptance**

1. CUANDO una asesora genera preguntas para un producto verificado EL SISTEMA DEBERA persistir preguntas con `product_id`, intent, difficulty, ideal answer y criteria validos.
2. CUANDO el cliente falso intenta incluir un claim ausente de `products` EL SISTEMA DEBERA rechazar esa salida y persistir cero preguntas de la tanda.
3. CUANDO una asesora abre una sesion EL SISTEMA DEBERA asignarla al `advisor_id` verificado del servidor, ignorando cualquier UUID enviado por el cliente.

**Verify**

```bash
pnpm test tests/unit/generate-questions.test.ts
pnpm test tests/integration/training-questions.test.ts
pnpm test:e2e tests/e2e/training-start.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: generate simulator questions"
git tag step-09-simulator-questions
```

### `E2-T2` — Evaluate Simulator answers

**Depends on:** `E2-T1` · **Priority:** p0

Guarda la respuesta antes de evaluar. Exige las nueve dimensiones por nombre, una razon por score y
respuesta mejorada. Otra asesora recibe 404, no un 403 que confirme existencia.

**Files:** `src/lib/ai/prompts/evaluate-answer.ts`, `src/server/training/evaluate.ts`,
`src/app/(app)/app/training/[sessionId]/page.tsx`, `tests/unit/evaluate-answer.test.ts`, `tests/`.

**Acceptance**

1. CUANDO una asesora envia una respuesta EL SISTEMA DEBERA persistir su texto y una evaluacion con las nueve dimensiones nombradas, razon por puntaje y version mejorada.
2. CUANDO la evaluacion externa falla EL SISTEMA DEBERA conservar `advisor_answer` y mostrar un error recuperable sin fabricar scores.
3. CUANDO otra asesora intenta abrir el `sessionId` EL SISTEMA DEBERA responder 404 y no revelar si la sesion existe.

**Verify**

```bash
pnpm test tests/unit/evaluate-answer.test.ts
pnpm test tests/integration/training-evaluation.test.ts
pnpm test:e2e tests/e2e/training-session.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: evaluate simulator answers"
git tag step-10-simulator-evaluation
```

### `E2-T3` — Compose streaming Copilot answers

**Depends on:** `E2-T2` · **Priority:** p0

Clasifica, compone y transmite desde ficha/reglas. Mide TTFT. El test local de 250 ms detecta
buffering; la meta real de produccion es p95 <2.5 s.

**Files:** `src/server/copilot/compose.ts`, `src/server/copilot/session.ts`,
`src/lib/ai/prompts/copilot.ts`, `src/app/(app)/app/copilot/page.tsx`, `tests/`.

**Acceptance**

1. CUANDO una asesora abre `/app/copilot` EL SISTEMA DEBERA seleccionar `express` como vista inicial y mostrar su objetivo de 15–20 segundos.
2. CUANDO se envia una pregunta EL SISTEMA DEBERA clasificarla, transmitir una respuesta con las seis partes aplicables y emitir el primer token en menos de 250 ms con el cliente falso local.
3. CUANDO el Knowledge Hub o Business Brain no contiene un dato EL SISTEMA DEBERA decir que no esta verificado y no citar ni completar informacion externa.
4. CUANDO termina la composicion EL SISTEMA DEBERA persistir un `copilot_exchange` con variante, duracion, confianza, CTA, regla y alertas.

**Verify**

```bash
pnpm test tests/unit/copilot-compose.test.ts
pnpm test tests/integration/copilot-session.test.ts
pnpm test:e2e tests/e2e/copilot.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: compose streaming copilot answers"
git tag step-11-copilot-compose
```

### `E2-T4` — Add Copilot orchestration and memory

**Depends on:** `E2-T3` · **Priority:** p0

Mantiene rotacion comercial como funcion pura. Actualiza memoria despues del exito, nunca antes. Si
solo hay una opcion puede repetirla; la regla es no repetir cuando existe alternativa.

**Files:** `src/server/copilot/orchestrator.ts`, `src/lib/copilot/view-defaults.ts`,
`src/components/copilot/answer-panel.tsx`, `tests/unit/`, `tests/integration/copilot-memory.test.ts`.

**Acceptance**

1. CUANDO el CTA anterior vuelve a ser candidato y existe una alternativa EL SISTEMA DEBERA seleccionar una alternativa.
2. CUANDO solo existe un CTA valido EL SISTEMA DEBERA poder repetirlo y nunca inventar otro.
3. CUANDO una regla comercial esta inactiva EL SISTEMA DEBERA excluirla de incentivos y de `promos_mentioned`.
4. CUANDO una composicion falla EL SISTEMA DEBERA dejar intacta la memoria de la sesion.

**Verify**

```bash
pnpm test tests/unit/copilot-orchestrator.test.ts
pnpm test tests/unit/copilot-view-defaults.test.ts
pnpm test tests/integration/copilot-memory.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: add copilot orchestration and memory"
git tag step-12-copilot-orchestration
```

### `E2-T5` — Enforce responsible communication

**Depends on:** `E2-T4` · **Priority:** p0

El gate determinista corre sobre toda salida. La cautela no es tono: embarazo, lactancia,
medicamentos, enfermedad, claim prohibido o refusal cambian lo que se permite persistir.

**Files:** `src/server/copilot/responsible.ts`, `src/lib/ai/prompts/copilot.ts`,
`tests/unit/responsible-communication.test.ts`, `tests/integration/copilot-responsible.test.ts`.

**Acceptance**

1. CUANDO una pregunta menciona embarazo, lactancia, medicamentos o enfermedad EL SISTEMA DEBERA evitar una recomendacion afirmativa, sugerir consulta profesional y marcar `revisar`.
2. CUANDO una respuesta contiene un claim prohibido o terapeutico EL SISTEMA DEBERA bloquearlo antes de persistir `answer_text` y devolver una alerta nombrada.
3. CUANDO la ficha no esta verificada o falta una fuente EL SISTEMA DEBERA impedir confianza `alto`.
4. CUANDO el proveedor retorna refusal EL SISTEMA DEBERA entregar una respuesta segura de cautela y conservar el refusal en `llm_calls.finish_reason`.

**Verify**

```bash
pnpm test tests/unit/responsible-communication.test.ts
pnpm test tests/integration/copilot-responsible.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: enforce responsible communication"
git tag step-13-responsible-communication
```

### `E2-T6` — Upload recordings and handle transcription callbacks

**Depends on:** `E2-T5` · **Priority:** p0

Carga `supabase`. Bucket privado, path por UUID, sin upsert. Deepgram usa REST; la forma externa queda
aislada en el request/fixture y se verifica otra vez antes de la primera llamada real.

**Files:** `src/server/recordings/upload.ts`, `src/server/recordings/transcription.ts`,
`src/app/api/transcription-callback/route.ts`, `tests/fixtures/deepgram-callback.json`, `tests/`.

**Acceptance**

1. CUANDO una asesora sube un archivo permitido EL SISTEMA DEBERA guardarlo en un bucket privado bajo su UUID y crear una fila `uploaded` con expiracion.
2. CUANDO se encola la transcripcion EL SISTEMA DEBERA enviar callback, diarizacion, idioma y modelo configurados, y pasar la fila a `transcribing`.
3. CUANDO el callback lleva secreto invalido EL SISTEMA DEBERA responder 401 sin leer el body ni escribir filas.
4. CUANDO el mismo callback valido llega dos veces EL SISTEMA DEBERA responder 200 ambas veces y efectuar la transicion `transcribing → transcribed` una sola vez.

**Verify**

```bash
pnpm test tests/unit/deepgram-request.test.ts
pnpm test tests/integration/recording-upload.test.ts
pnpm test tests/integration/transcription-callback.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: upload recordings and handle transcription callbacks"
git tag step-14-live-transcription
```

### `E2-T7` — Analyze recordings and promote insights

**Depends on:** `E2-T6` · **Priority:** p0

Extrae seis tipos, redacta PII y promueve en transaccion. Un insight ya promovido devuelve su
pregunta, no duplica material de entrenamiento.

**Files:** `src/server/recordings/analyze.ts`, `src/server/insights.ts`,
`src/lib/ai/prompts/analyze-transcript.ts`, `src/app/(app)/app/intelligence/page.tsx`, `tests/`.

**Acceptance**

1. CUANDO una grabacion transcrita se analiza EL SISTEMA DEBERA pasar por `analyzing`, crear insights validos y terminar en `analyzed`.
2. CUANDO se promueve un insight elegible EL SISTEMA DEBERA crear una pregunta con `source = 'live_insight'` y enlazar ambos registros en una transaccion.
3. CUANDO el mismo insight se promueve otra vez EL SISTEMA DEBERA devolver la pregunta ya enlazada y no crear otra.
4. CUANDO una transcripcion contiene PII EL SISTEMA DEBERA evitar copiar nombres o telefonos literales al texto del insight o a la pregunta promovida.

**Verify**

```bash
pnpm test tests/unit/analyze-transcript.test.ts
pnpm test tests/integration/live-insights.test.ts
pnpm test:e2e tests/e2e/live-intelligence.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T7: analyze recordings and promote insights"
git tag step-15-live-insights
```

### `E2-T8` — Add dashboard retention CI and deployment

**Depends on:** `E2-T7` · **Priority:** p0

Agrega KPIs por rol, cron reconciliatorio y CI. Usa advisory lock. Las migraciones son job separado;
`next build` y el arranque nunca cambian schema. Vercel Cron gana a pg_cron porque borra Storage.

**Files:** `src/app/(app)/app/page.tsx`, `src/app/api/cron/retention/route.ts`,
`.github/workflows/ci.yml`, `vercel.json`, `tests/`.

**Acceptance**

1. CUANDO una asesora abre el dashboard EL SISTEMA DEBERA calcular metricas solo sobre su `advisor_id`; un admin recibe agregados de la organizacion y costo total.
2. CUANDO el cron recibe un bearer invalido EL SISTEMA DEBERA responder 401 y borrar cero objetos y filas.
3. CUANDO el cron procesa una grabacion vencida EL SISTEMA DEBERA borrar objeto, transcripcion, fila e insights, y una segunda ejecucion debera procesar cero.
4. CUANDO dos ejecuciones se solapan EL SISTEMA DEBERA permitir una y devolver `skipped: true` en la otra.
5. CUANDO CI corre sobre un checkout limpio EL SISTEMA DEBERA instalar el lockfile, migrar la base de pruebas y pasar typecheck, lint y tests antes de construir.

**Verify**

```bash
pnpm test tests/integration/dashboard.test.ts
pnpm test tests/integration/retention.test.ts
pnpm test:e2e tests/e2e/dashboard.spec.ts
pnpm build
pnpm exec next start --port 3102 & SRV=$!; for i in $(seq 1 30); do curl -sf http://127.0.0.1:3102/health >/dev/null && break; sleep 1; done; curl -sf http://127.0.0.1:3102/health | grep -q '"ok":true'; RC=$?; kill $SRV; exit $RC
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T8: add dashboard retention ci and deployment"
git tag step-16-deploy
```

---

## Epic acceptance

1. CUANDO una pregunta real recorre Knowledge Hub, Copilot y memoria EL SISTEMA DEBERA producir Express segura, trazada y sin repetir CTA cuando hay alternativa.
2. CUANDO una grabacion sintetica recorre callback, analisis y promocion EL SISTEMA DEBERA crear una pregunta `live_insight` sin PII y sin duplicarla.
3. CUANDO retencion procesa el resultado vencido EL SISTEMA DEBERA eliminar objeto y datos derivados una sola vez.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm test:e2e
```

## Pitfalls y cierre

- No confundas respuesta segura con consejo medico; la ruta cautelosa evita recomendar.
- No actualices memoria antes de que la composicion termine.
- No confies en callback una sola vez ni leas body antes de validar secreto.
- No copies PII de transcripcion a insights, logs o fixtures.
- No migres durante build/start y no conviertas evals sin calibrar en gate.

Antes de lanzar: las ocho tareas estan `done`, sus verify arrays pasaron, existen tags `step-09-*` a
`step-16-*`, §20.1 esta verde, el arbol esta limpio y las verificaciones humanas de keys/Deepgram y
fichas se completaron.
