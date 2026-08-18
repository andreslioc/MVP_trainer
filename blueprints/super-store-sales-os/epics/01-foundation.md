# Epic 01: Foundation

> De un arbol configurado a una base autenticada, editable y con gateway de IA probado.

| | |
|---|---|
| **Epic id** | `01-foundation` |
| **Tasks** | `E1-T1` … `E1-T8` |
| **Depends on** | nada — empieza aqui |
| **Unlocks** | `02-product-loop` |
| **Parallel with** | ninguno; este epic establece todos los contratos base |

No necesitas leer `blueprint.md`. Lee `CLAUDE.md`, la regla del area que vas a tocar y la entrada
actual de `tasks.json`. El estado y el orden viven en `tasks.json`; este archivo aporta direccion.

---

## Stack y comandos

Next 16.3.1 · React 19.2.8 · TypeScript 6.0.3 · Tailwind 4.3.3 · Drizzle/Postgres ·
Supabase Auth/Storage · Gemini REST. Gestor `pnpm@11.22.0`; Node 24.19.0 en `.nvmrc`.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test | `pnpm test` |
| E2E | `pnpm test:e2e` |
| Postgres test | `pnpm db:up` / `pnpm db:down` |
| Supabase local | `pnpm supabase:start` / `pnpm supabase:stop` |
| Migrar test/dev | `pnpm db:migrate:test` / `pnpm db:migrate` |

**Gate por tarea:** `pnpm typecheck && pnpm lint && pnpm test`.

## Subarbol y contratos

```text
src/app/health/route.ts                 # liveness + db probe
src/app/login/                          # login sin registro publico
src/app/(app)/                          # shell, Knowledge y Settings
src/components/layout/nav-items.ts      # navegacion pura por rol
src/db/{schema,client}.ts               # schema unico y conexion unica
src/lib/{env,auth}.ts                   # entorno y sesion verificada
src/lib/ai/{config,gateway,schemas,structured}.ts
src/server/{products,commercial-rules,llm-calls}.ts
scripts/seed.ts
tests/{unit,integration,e2e}/
```

Contratos producidos para Epic 02:

- `requireRole(role)` devuelve advisor activo derivado de claims verificados.
- `products` y `commercial_rules` son las unicas fuentes de conocimiento/comercio.
- `callModel()` es la unica costura con el proveedor de IA y siempre registra uso.
- `parseStructured()` entrega salida Zod o `AI_INVALID_OUTPUT` tras un solo repair.
- `src/db/client.ts` es el unico modulo que abre Postgres.

Convenciones que muerden: imports relativos con extension; `getClaims()` autoriza, no
`auth.getSession()`; app usa pooler sin prepared statements; migraciones usan directa; ninguna Server
Action confia en IDs del cliente; no se edita una migracion generada.

---

## Tasks

### `E1-T1` — Scaffold toolchain and health endpoint

**Depends on:** nada · **Priority:** p0

Confirma el resultado del bootstrap y crea el primer endpoint ejecutable. La validacion de entorno
es progresiva: no exijas secretos de features futuras.

**Files:** `src/lib/env.ts`, `src/app/health/route.ts`, `tests/unit/health.test.ts`.

**Acceptance**

1. CUANDO el servidor arranca en el puerto 3100 EL SISTEMA DEBERA responder en `/health` con HTTP 200 y JSON que contenga `"ok":true`.
2. CUANDO Biome analiza `src/app/health/route.ts` EL SISTEMA DEBERA salir 0 usando la configuracion que reconoce directivas de Tailwind v4.
3. CUANDO se inspeccionan los pines EL SISTEMA DEBERA reportar Node 24.19.0, pnpm 11.22.0 y TypeScript 6.0.3, sin resolver TypeScript 7.

**Verify**

```bash
test -f package.json && test -f pnpm-lock.yaml && test -f postcss.config.mjs
pnpm exec biome check src/app/health/route.ts
test "$(node -p "require('./package.json').devDependencies.typescript")" = "6.0.3"
(pnpm exec next dev --port 3100 >/tmp/super-store-health.log 2>&1 & app_pid=$!; trap 'kill "$app_pid" 2>/dev/null || true' EXIT; for attempt in $(seq 1 90); do curl -sf http://127.0.0.1:3100/health | grep -q '"ok":true' && exit 0; sleep 1; done; cat /tmp/super-store-health.log; exit 1)
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: scaffold toolchain and health endpoint"
git tag step-01-scaffold-health
```

### `E1-T2` — Create Drizzle schema migrations and seed

**Depends on:** `E1-T1` · **Priority:** p0

Carga `supabase-postgres-best-practices` antes de escribir tablas. Implementa el esquema de doce
entidades, indices de FKs/aislamiento, conexion unica y seed idempotente. El paso usa Postgres puro.
Tambien completa el contrato de `/health` de §5 con el campo `db`, que el paso 1 dejo pendiente.

**Files:** `src/db/schema.ts`, `src/db/client.ts`, `scripts/seed.ts`,
`src/app/health/route.ts`, `tests/`.

**Acceptance**

1. CUANDO las migraciones corren sobre una base de pruebas vacia EL SISTEMA DEBERA crear por nombre `advisors`, `products`, `commercial_rules`, `training_questions`, `training_sessions`, `training_answers`, `live_sessions`, `copilot_exchanges`, `live_recordings`, `insights`, `llm_calls` y `prompts`, mas sus enums.
2. CUANDO `pnpm db:seed` corre dos veces EL SISTEMA DEBERA conservar una sola fila por cada clave natural sembrada y salir 0 ambas veces.
3. CUANDO una prueba crea un advisor desde el escritor autorizado EL SISTEMA DEBERA guardar exactamente el UUID recibido como `advisors.id`.
4. CUANDO se pide `/health` con la base arriba EL SISTEMA DEBERA responder `{ "ok": true, "db": "up", "commit": ... }`, y CUANDO la base no responde EL SISTEMA DEBERA seguir devolviendo `"ok": true` con `"db": "down"`.

**Verify**

```bash
pnpm db:up && pnpm db:migrate:test
pnpm test tests/integration/schema.test.ts
pnpm db:seed && pnpm db:seed
pnpm test tests/integration/seed-idempotency.test.ts
pnpm test tests/unit/health.test.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: create drizzle schema migrations and seed"
git tag step-02-database-schema
```

### `E1-T3` — Add invitation auth roles proxy and RLS

**Depends on:** `E1-T2` · **Priority:** p0

Carga `supabase`. Usa clients SSR con cookies y `getClaims()` para autorizar. Crea `proxy.ts`, login,
invitacion admin y RLS con `TO authenticated`, `(select auth.uid())`, `USING` y `WITH CHECK`.

**Files:** `src/lib/auth.ts`, `proxy.ts`, `src/app/login/`,
`tests/integration/auth-rls.test.ts`, `tests/e2e/auth.spec.ts`.

**Acceptance**

1. CUANDO una peticion sin sesion entra a `/app` EL SISTEMA DEBERA redirigirla a `/login?next=/app`.
2. CUANDO credenciales validas pertenecen a un advisor inactivo EL SISTEMA DEBERA cerrar la sesion y retornar `FORBIDDEN` sin renderizar `/app`.
3. CUANDO se consulta `pg_class` y `pg_policies` en Supabase local EL SISTEMA DEBERA mostrar RLS habilitado y politicas nombradas para cada tabla protegida.
4. CUANDO el proxy autoriza una peticion EL SISTEMA DEBERA basar la identidad en claims JWT verificados, no en datos de sesion sin revalidar.

**Verify**

```bash
pnpm supabase:start && pnpm env:local:supabase && pnpm db:migrate
pnpm test tests/integration/auth-rls.test.ts
pnpm test:e2e tests/e2e/auth.spec.ts
test -f proxy.ts && test ! -f middleware.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: add invitation auth roles proxy and rls"
git tag step-03-auth-rls
```

### `E1-T4` — Build authenticated shell and design tokens

**Depends on:** `E1-T3` · **Priority:** p1

Implementa el bloque `@theme`, shell server-first y navegacion filtrada. Ocultar un link no sustituye
`requireRole`; el filtro es presentacion y tiene una prueba pura.

**Files:** `src/app/globals.css`, `src/app/(app)/layout.tsx`,
`src/components/layout/nav-items.ts`, `tests/unit/`, `tests/e2e/app-shell.spec.ts`.

**Acceptance**

1. CUANDO una asesora abre `/app` EL SISTEMA DEBERA mostrar Training, Copilot, Intelligence y Knowledge, y ocultar Settings.
2. CUANDO un admin abre `/app` EL SISTEMA DEBERA mostrar tambien Settings.
3. CUANDO una prueba estatica inspecciona los controles EL SISTEMA DEBERA encontrar el token `--border-control: #64748B`, foco visible y texto para cada estado que usa color.
4. CUANDO el viewport mide 767px EL SISTEMA DEBERA colapsar la navegacion sin scroll horizontal en la pagina.

**Verify**

```bash
pnpm test tests/unit/nav.test.ts
pnpm test tests/unit/design-tokens.test.ts
pnpm test:e2e tests/e2e/app-shell.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: build authenticated shell and design tokens"
git tag step-04-app-shell
```

### `E1-T5` — Build Knowledge Hub CRUD

**Depends on:** `E1-T4` · **Priority:** p0

Valida toda la ficha en el borde y prueba permisos tanto por accion como por Data API. Tres beneficios
y fuentes verificables son invariantes de contenido, no ayudas visuales.

**Files:** `src/lib/validation/product.ts`, `src/server/products.ts`,
`src/app/(app)/app/knowledge/`, `tests/unit/product-validation.test.ts`, `tests/`.

**Acceptance**

1. CUANDO un admin envia una ficha valida EL SISTEMA DEBERA persistir todos los campos del Knowledge Hub y devolver un resultado tipado `ok: true`.
2. CUANDO una ficha trae menos o mas de tres beneficios EL SISTEMA DEBERA rechazarla antes de escribir y nombrar el campo `benefits`.
3. CUANDO una asesora intenta escribir `products` por Server Action o Data API EL SISTEMA DEBERA denegar ambas rutas y dejar las filas sin cambios.
4. CUANDO cualquier rol autenticado lista fichas EL SISTEMA DEBERA recibir los productos ordenados con los no verificados primero.

**Verify**

```bash
pnpm test tests/unit/product-validation.test.ts
pnpm test tests/integration/products.test.ts
pnpm test tests/integration/products-rls.test.ts
pnpm test:e2e tests/e2e/knowledge-hub.spec.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: build knowledge hub crud"
git tag step-05-knowledge-hub
```

### `E1-T6` — Build configurable Business Brain

**Depends on:** `E1-T5` · **Priority:** p0

Las claves son estables y los valores configurables. Una regla inactiva desaparece inmediatamente de
la composicion; no hardcodees el umbral sembrado ni el texto de promociones.

**Files:** `src/lib/validation/commercial-rule.ts`, `src/server/commercial-rules.ts`,
`src/app/(app)/app/settings/page.tsx`, `tests/unit/commercial-rule-validation.test.ts`,
`tests/integration/commercial-rules.test.ts`.

**Acceptance**

1. CUANDO un admin cambia el umbral de `envio_gratis` EL SISTEMA DEBERA devolver el nuevo valor desde la siguiente lectura sin reiniciar la app.
2. CUANDO `promo_live.active` es false EL SISTEMA DEBERA excluirla de las reglas disponibles para composicion.
3. CUANDO una asesora intenta modificar una regla EL SISTEMA DEBERA retornar `FORBIDDEN` y escribir cero filas.

**Verify**

```bash
pnpm test tests/unit/commercial-rule-validation.test.ts
pnpm test tests/integration/commercial-rules.test.ts
rg -n '120000|envio gratis' src --glob '!src/server/commercial-rules.ts' --glob '!src/app/**'; test $? -eq 1
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: build configurable business brain"
git tag step-06-business-brain
```

### `E1-T7` — Create AI gateway and usage ledger

**Depends on:** `E1-T6` · **Priority:** p0

Encapsula el proveedor, inyecta cliente falso y registra uso reportado. Revisa `finishReason` antes de tocar
content; un refusal con HTTP 200 no es exito normal.

**Files:** `src/lib/ai/config.ts`, `src/lib/ai/gateway.ts`, `src/server/llm-calls.ts`,
`tests/unit/ai-gateway.test.ts`, `tests/integration/llm-calls.test.ts`.

**Acceptance**

1. CUANDO una respuesta del proveedor termina normalmente EL SISTEMA DEBERA persistir modelo, proposito, latencia, tokens, cache, costo y finish reason en una fila de `llm_calls`.
2. CUANDO `finishReason` es `refusal` EL SISTEMA DEBERA detectarlo antes de leer el texto y devolver un resultado tipado que obliga al consumidor a degradar con cautela.
3. CUANDO se busca el header del proveedor en archivos fuente EL SISTEMA DEBERA encontrar coincidencias en exactamente un archivo: `src/lib/ai/gateway.ts`.

**Verify**

```bash
pnpm test tests/unit/ai-gateway.test.ts
pnpm test tests/integration/llm-calls.test.ts
test "$(rg -l 'x-goog-api-key' src --glob '*.ts' --glob '*.tsx' | wc -l | tr -d ' ')" = "1" && rg -q 'x-goog-api-key' src/lib/ai/gateway.ts
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T7: create ai gateway and usage ledger"
git tag step-07-ai-gateway
```

### `E1-T8` — Add structured output and one repair retry

**Depends on:** `E1-T7` · **Priority:** p0

Usa Zod structured output, no JSON pedido en prosa. `parsedOutput` nulo permite exactamente un
repair; despues falla tipado y nunca entrega un objeto parcial.

**Files:** `src/lib/ai/schemas.ts`, `src/lib/ai/structured.ts`,
`tests/unit/structured-output.test.ts`.

**Acceptance**

1. CUANDO el modelo retorna una salida valida EL SISTEMA DEBERA entregar el objeto tipado sin reintento.
2. CUANDO la primera salida no cumple el schema EL SISTEMA DEBERA realizar exactamente un reintento de reparacion y entregar la segunda si es valida.
3. CUANDO ambas salidas fallan EL SISTEMA DEBERA devolver `AI_INVALID_OUTPUT` sin entregar JSON parcial al consumidor.

**Verify**

```bash
pnpm test tests/unit/structured-output.test.ts
rg -n 'Authorization.*Bearer|gemini-[0-9]' src/lib/ai src/server --glob '!src/lib/ai/config.ts'; test $? -eq 1
pnpm typecheck && pnpm lint && pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T8: add structured output and one repair retry"
git tag step-08-structured-output
```

---

## Epic acceptance

1. CUANDO un admin autenticado crea producto y regla EL SISTEMA DEBERA persistir ambos y una asesora debera leerlos sin poder modificarlos.
2. CUANDO el gateway recibe exito, refusal y salida invalida EL SISTEMA DEBERA trazar cada llamada y nunca entregar contenido sin validar.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/auth.spec.ts tests/e2e/app-shell.spec.ts tests/e2e/knowledge-hub.spec.ts
```

## Pitfalls y cierre

- No uses `auth.getSession()` para autorizar ni `user_metadata` para rol.
- No conectes Drizzle al pooler para migrar ni habilites prepared statements con pooler transaccional.
- No importes el SDK fuera del gateway.
- No exijas secretos de Epic 02 en el arranque de Epic 01.

Antes de pasar: las ocho tareas estan `done`, sus ocho verify arrays pasaron, existen los tags
`step-01-*` a `step-08-*`, el arbol esta limpio y ningun archivo fuera del subarbol fue modificado.
