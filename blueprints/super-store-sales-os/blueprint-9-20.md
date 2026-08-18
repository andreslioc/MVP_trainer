## 9. Orden de construccion

Este orden es ejecutable, no una lista de deseos. Cada paso cabe en una sentada, conserva verdes los
gates anteriores y termina con un commit mas una etiqueta que sirve como rollback. El orden de cada
paso es siempre **Do → Done when → Verify → Checkpoint**. El `Verify` nunca depende del commit o de la
etiqueta que se crean despues.

Reglas para los dieciseis pasos:

1. Maximo cinco rutas de trabajo y seis criterios por paso. Si el builder necesita mas, se detiene y
   reporta una frontera mal trazada; no expande el paso en silencio.
2. Cada criterio usa EARS y es decidible por los comandos del propio paso.
3. Todo `Verify` se corre desde la raiz del proyecto destino, no desde el directorio del bundle.
4. Cada linea de `Verify` sale 0 cuando la propiedad es correcta. Los caminos de error esperados se
   envuelven en una asercion que convierte el resultado esperado en salida 0.
5. Ningun gate llama a Anthropic, Deepgram, Vercel ni a un proyecto hospedado. Los clientes falsos,
   Postgres de Docker y Supabase local cubren la construccion.
6. Antes de marcar un paso hecho tambien pasa el gate comun:
   `pnpm typecheck && pnpm lint && pnpm test`.
7. Las skills recomendadas en §18 ayudan, pero ningun criterio depende de que esten instaladas.

### Paso 1 — Scaffold, toolchain y `/health`

**Do**

- Confirmar que §10 ya genero `package.json`, `pnpm-lock.yaml` y `postcss.config.mjs`.
- Crear `src/lib/env.ts` con validacion progresiva: en este paso solo son obligatorias las tres URLs
  de Postgres; las credenciales de features futuras son opcionales hasta su paso.
- Crear `src/app/health/route.ts`. Primero responde `{ "ok": true, "commit": "unknown" }`; el paso 2
  agrega el probe `db` sin romper esta forma minima.
- Conservar el `biome.json` emitido, incluida la opcion `tailwindDirectives` y la exclusion de
  `blueprints/`. No correr `biome init`: se niega a sobrescribir una configuracion existente.

**Done when**

1. **CUANDO** el servidor arranca en el puerto 3100 **EL SISTEMA DEBERA** responder en `/health` con
   HTTP 200 y JSON que contenga `"ok":true`.
2. **CUANDO** Biome analiza `src/app/health/route.ts` **EL SISTEMA DEBERA** salir 0 usando la
   configuracion que reconoce directivas de Tailwind v4.
3. **CUANDO** se inspeccionan los pines **EL SISTEMA DEBERA** reportar Node 24.19.0, pnpm 11.22.0 y
   TypeScript 6.0.3, sin resolver TypeScript 7.

**Verify**

```bash
test -f package.json && test -f pnpm-lock.yaml && test -f postcss.config.mjs # pasa: los tres artefactos del scaffold existen
pnpm exec biome check src/app/health/route.ts # pasa: exit 0 y biome.json acepta Tailwind v4
test "$(node -p "require('./package.json').devDependencies.typescript")" = "6.0.3" # pasa: TypeScript queda en la linea compatible
(pnpm exec next dev --port 3100 >/tmp/super-store-health.log 2>&1 & app_pid=$!; trap 'kill "$app_pid" 2>/dev/null || true' EXIT; for attempt in $(seq 1 90); do curl -sf http://127.0.0.1:3100/health | grep -q '"ok":true' && exit 0; sleep 1; done; cat /tmp/super-store-health.log; exit 1) # pasa: el primer ejecutable arranca y /health responde
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 1: scaffold and health"
git tag step-01-scaffold-health
```

### Paso 2 — Esquema Drizzle, migraciones y semillas

Antes de escribir la primera tabla, cargar `supabase-postgres-best-practices`. `pnpm db:up` basta en
este paso: el esquema portable se prueba contra Postgres puro; Supabase completo empieza en el paso 3.

**Do**

- Crear `src/db/schema.ts` con los enums, entidades, constraints e indices de §4; indexar cada FK y
  cada columna de aislamiento usada por RLS.
- Crear `src/db/client.ts` como unico punto que abre conexiones. La app usa `DATABASE_URL` con
  prepared statements desactivados para el pooler transaccional; migraciones usan la URL directa.
- Generar la migracion con `pnpm db:generate`, aplicarla con `pnpm db:migrate:test` y escribir
  `scripts/seed.ts` idempotente. El script carga entorno mediante `src/lib/load-env.ts`.
- Sembrar producto, reglas, prompts y preguntas definidas en §4. El usuario de Auth y el bucket se
  omiten limpiamente mientras Supabase no este arriba.

**Done when**

1. **CUANDO** las migraciones corren sobre una base de pruebas vacia **EL SISTEMA DEBERA** crear por
   nombre `advisors`, `products`, `commercial_rules`, `training_questions`, `training_sessions`,
   `training_answers`, `live_sessions`, `copilot_exchanges`, `live_recordings`, `insights`,
   `llm_calls` y `prompts`, mas sus enums.
2. **CUANDO** `pnpm db:seed` corre dos veces **EL SISTEMA DEBERA** conservar una sola fila por cada
   clave natural sembrada y salir 0 ambas veces.
3. **CUANDO** una prueba crea un advisor desde el escritor autorizado **EL SISTEMA DEBERA** guardar
   exactamente el UUID recibido como `advisors.id`.

**Verify**

```bash
pnpm db:up && pnpm db:migrate:test # pasa: Postgres esta saludable y todas las migraciones aplican
pnpm test tests/integration/schema.test.ts # pasa: cada tabla, enum, FK e indice requerido existe por nombre
pnpm db:seed && pnpm db:seed # pasa: las dos ejecuciones salen 0
pnpm test tests/integration/seed-idempotency.test.ts # pasa: no hay duplicados por clave natural
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 2: database schema and seed"
git tag step-02-database-schema
```

### Paso 3 — Auth por invitacion, roles, proxy y RLS

Cargar `supabase` antes de tocar Auth o RLS. `src/lib/auth.ts` puede conservar el nombre de dominio
`getSession()`, pero su identidad verificada debe venir de `supabase.auth.getClaims()`; nunca confia
en el objeto devuelto por `supabase.auth.getSession()` para autorizar. `getUser()` queda para cuando
se necesite el registro fresco del usuario, no como consulta de sesion en cada request.

**Do**

- Arrancar Supabase local, refrescar `.env.local` y aplicar las migraciones a su Postgres directo.
- Crear clientes SSR con cookies, login email+contrasena, `requireRole()` y el flujo admin que crea el
  usuario de Auth mas `advisors` con el mismo UUID, compensando si falla la segunda escritura.
- Crear `proxy.ts`, nunca `middleware.ts`, con las exclusiones de §8.
- Crear una migracion `pnpm db:generate:custom` para grants y RLS. Usar `TO authenticated`,
  `(select auth.uid())`, `USING` mas `WITH CHECK` en updates, y nunca `user_metadata` para rol.

**Done when**

1. **CUANDO** una peticion sin sesion entra a `/app` **EL SISTEMA DEBERA** redirigirla a
   `/login?next=/app`.
2. **CUANDO** credenciales validas pertenecen a un advisor inactivo **EL SISTEMA DEBERA** cerrar la
   sesion y retornar `FORBIDDEN` sin renderizar `/app`.
3. **CUANDO** se consulta `pg_class` y `pg_policies` en Supabase local **EL SISTEMA DEBERA** mostrar
   RLS habilitado y politicas nombradas para cada tabla protegida de §8.
4. **CUANDO** el proxy autoriza una peticion **EL SISTEMA DEBERA** basar la identidad en claims JWT
   verificados, no en datos de sesion sin revalidar.

**Verify**

```bash
pnpm supabase:start && pnpm env:local:supabase && pnpm db:migrate # pasa: Supabase local arranca y recibe el esquema
pnpm test tests/integration/auth-rls.test.ts # pasa: invitacion, inactividad, claims verificados y politicas estructurales
pnpm test:e2e tests/e2e/auth.spec.ts # pasa: login, redireccion y logout cumplen el contrato
test -f proxy.ts && test ! -f middleware.ts # pasa: Next 16 usa el nombre correcto
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 3: invitation auth and rls"
git tag step-03-auth-rls
```

### Paso 4 — Shell autenticado y sistema de diseno

**Do**

- Implementar los tokens literales de §7 en `src/app/globals.css` con `@theme`.
- Crear root layout, shell autenticado, sidebar y header. `visibleNavItems(role)` es una funcion pura;
  el rol filtra enlaces, pero el permiso real sigue en el servidor.
- Mantener pages y layouts como Server Components. Solo los controles interactivos son cliente.

**Done when**

1. **CUANDO** una asesora abre `/app` **EL SISTEMA DEBERA** mostrar Training, Copilot, Intelligence y
   Knowledge, y ocultar Settings.
2. **CUANDO** un admin abre `/app` **EL SISTEMA DEBERA** mostrar tambien Settings.
3. **CUANDO** una prueba estatica inspecciona los controles **EL SISTEMA DEBERA** encontrar el token
   `--border-control: #64748B`, foco visible y texto para cada estado que usa color.
4. **CUANDO** el viewport mide 767px **EL SISTEMA DEBERA** colapsar la navegacion sin scroll
   horizontal en la pagina.

**Verify**

```bash
pnpm test tests/unit/nav.test.ts # pasa: la navegacion visible coincide con asesor y admin
pnpm test tests/unit/design-tokens.test.ts # pasa: tokens y pares accesibles existen por nombre
pnpm test:e2e tests/e2e/app-shell.spec.ts # pasa: shell responsive y navegacion por rol
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 4: authenticated app shell"
git tag step-04-app-shell
```

### Paso 5 — Knowledge Hub

**Do**

- Crear los esquemas Zod de la ficha completa; beneficios son exactamente tres y una evidencia alta
  exige una fuente.
- Crear acciones CRUD en `src/server/products.ts`, todas con `requireRole('admin')` al escribir.
- Crear lista legible por asesora y formulario editable por admin, con estados de §6.
- Probar el aislamiento por comportamiento usando Supabase local: una asesora autenticada no puede
  insertar ni actualizar `products`, aunque construya la peticion a mano.

**Done when**

1. **CUANDO** un admin envia una ficha valida **EL SISTEMA DEBERA** persistir todos los campos del
   Knowledge Hub y devolver un resultado tipado `ok: true`.
2. **CUANDO** una ficha trae menos o mas de tres beneficios **EL SISTEMA DEBERA** rechazarla antes de
   escribir y nombrar el campo `benefits`.
3. **CUANDO** una asesora intenta escribir `products` por Server Action o Data API **EL SISTEMA
   DEBERA** denegar ambas rutas y dejar las filas sin cambios.
4. **CUANDO** cualquier rol autenticado lista fichas **EL SISTEMA DEBERA** recibir los productos
   ordenados con los no verificados primero.

**Verify**

```bash
pnpm test tests/unit/product-validation.test.ts # pasa: forma JSON, tres beneficios y fuentes se validan
pnpm test tests/integration/products.test.ts # pasa: CRUD admin y lectura de asesora conservan alcance
pnpm test tests/integration/products-rls.test.ts # pasa: la Data API rechaza escritura de asesora y no cambia filas
pnpm test:e2e tests/e2e/knowledge-hub.spec.ts # pasa: lista, vacio, error y formulario son observables
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 5: knowledge hub"
git tag step-05-knowledge-hub
```

### Paso 6 — Business Brain

**Do**

- Crear validacion y acciones para las claves estables de `commercial_rules`.
- Completar `/app/settings` para editar valor, activar y desactivar reglas; no borrar claves que el
  codigo consulta.
- Centralizar la lectura de reglas activas. Ningun umbral, cupon o texto de promocion queda en codigo.

**Done when**

1. **CUANDO** un admin cambia el umbral de `envio_gratis` **EL SISTEMA DEBERA** devolver el nuevo
   valor desde la siguiente lectura sin reiniciar la app.
2. **CUANDO** `promo_live.active` es false **EL SISTEMA DEBERA** excluirla de las reglas disponibles
   para composicion.
3. **CUANDO** una asesora intenta modificar una regla **EL SISTEMA DEBERA** retornar `FORBIDDEN` y
   escribir cero filas.

**Verify**

```bash
pnpm test tests/unit/commercial-rule-validation.test.ts # pasa: cada clave conocida acepta solo su forma valida
pnpm test tests/integration/commercial-rules.test.ts # pasa: admin configura, asesora solo lee y reglas inactivas se excluyen
! rg -n '120000|envio gratis' src --glob '!src/server/commercial-rules.ts' --glob '!src/app/**' # pasa: no hay umbral comercial incrustado en logica consumidora
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 6: business brain"
git tag step-06-business-brain
```

### Paso 7 — Gateway de IA y costo por llamada

**Do**

- Crear `src/lib/ai/config.ts`, `gateway.ts` y el unico escritor `src/server/llm-calls.ts`.
- El gateway recibe un cliente inyectable, mide latencia, revisa `stop_reason` antes de leer
  `content`, persiste el uso reportado y calcula costo desde la tabla de precios configurada.
- Ningun test usa `ANTHROPIC_API_KEY`; un cliente falso entrega respuestas y uso deterministas.

**Done when**

1. **CUANDO** una respuesta del proveedor termina normalmente **EL SISTEMA DEBERA** persistir modelo,
   proposito, latencia, tokens, cache, costo y finish reason en una fila de `llm_calls`.
2. **CUANDO** `stop_reason` es `refusal` **EL SISTEMA DEBERA** detectarlo antes de leer `content` y
   devolver un resultado tipado que obliga al consumidor a degradar con cautela.
3. **CUANDO** se busca `@anthropic-ai/sdk` en archivos fuente **EL SISTEMA DEBERA** encontrar imports
   en exactamente un archivo: `src/lib/ai/gateway.ts`.

**Verify**

```bash
pnpm test tests/unit/ai-gateway.test.ts # pasa: orden de stop_reason, uso, costo y errores estan probados con cliente falso
pnpm test tests/integration/llm-calls.test.ts # pasa: una traza completa queda persistida y atribuida
test "$(rg -l '@anthropic-ai/sdk' src --glob '*.ts' --glob '*.tsx' | wc -l | tr -d ' ')" = "1" && rg -q '@anthropic-ai/sdk' src/lib/ai/gateway.ts # pasa: exactamente un archivo importa el SDK
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 7: ai gateway and usage ledger"
git tag step-07-ai-gateway
```

### Paso 8 — Structured output y reparacion

**Do**

- Crear los schemas Zod de salida en `src/lib/ai/schemas.ts` y el wrapper en `structured.ts`.
- Usar `messages.parse()` y `zodOutputFormat()` desde el gateway. Si `parsed_output` es null, ejecutar
  un solo reintento de reparacion con el error de validacion; nunca un loop abierto.
- Persistir las dos llamadas si hubo reparacion, cada una con su uso real.

**Done when**

1. **CUANDO** el modelo retorna una salida valida **EL SISTEMA DEBERA** entregar el objeto tipado sin
   reintento.
2. **CUANDO** la primera salida no cumple el schema **EL SISTEMA DEBERA** realizar exactamente un
   reintento de reparacion y entregar la segunda si es valida.
3. **CUANDO** ambas salidas fallan **EL SISTEMA DEBERA** devolver `AI_INVALID_OUTPUT` sin entregar JSON
   parcial al consumidor.

**Verify**

```bash
pnpm test tests/unit/structured-output.test.ts # pasa: 0, 1 y nunca mas de 1 reparacion estan afirmadas
! rg -n 'output_format|budget_tokens|assistant.*prefill' src/lib/ai src/server # pasa: no aparecen parametros incompatibles o deprecados
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 8: structured ai output"
git tag step-08-structured-output
```

### Paso 9 — Simulator: generacion de preguntas

**Do**

- Crear el prompt `generate-questions.ts` usando solo la ficha seleccionada.
- Crear `src/server/training/questions.ts` para generar, validar y persistir preguntas balanceadas por
  dificultad e intencion con `source = 'generated'`.
- Crear `/app/training` con selector, estados y apertura de sesion privada de la asesora.

**Done when**

1. **CUANDO** una asesora genera preguntas para un producto verificado **EL SISTEMA DEBERA** persistir
   preguntas con `product_id`, intent, difficulty, ideal answer y criteria validos.
2. **CUANDO** el cliente falso intenta incluir un claim ausente de `products` **EL SISTEMA DEBERA**
   rechazar esa salida y persistir cero preguntas de la tanda.
3. **CUANDO** una asesora abre una sesion **EL SISTEMA DEBERA** asignarla al `advisor_id` verificado
   del servidor, ignorando cualquier UUID enviado por el cliente.

**Verify**

```bash
pnpm test tests/unit/generate-questions.test.ts # pasa: balance, schema y limite del Knowledge Hub se cumplen
pnpm test tests/integration/training-questions.test.ts # pasa: generacion y sesion quedan atribuidas a la asesora autenticada
pnpm test:e2e tests/e2e/training-start.spec.ts # pasa: selector, vacio, carga y apertura de sesion son observables
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 9: simulator questions"
git tag step-09-simulator-questions
```

### Paso 10 — Simulator: evaluacion y respuesta mejorada

**Do**

- Crear prompt y accion de evaluacion. Guardar primero la respuesta de la asesora; si la IA falla,
  conservarla y mostrar que la evaluacion esta pendiente/fallo.
- Exigir las nueve claves exactas de §4, score 1..5, razon por dimension, feedback global y
  `improved_answer` no vacio.
- Completar `/app/training/[sessionId]` con aislamiento por asesora.

**Done when**

1. **CUANDO** una asesora envia una respuesta **EL SISTEMA DEBERA** persistir su texto y una
   evaluacion con las nueve dimensiones nombradas, razon por puntaje y version mejorada.
2. **CUANDO** la evaluacion externa falla **EL SISTEMA DEBERA** conservar `advisor_answer` y mostrar
   un error recuperable sin fabricar scores.
3. **CUANDO** otra asesora intenta abrir el `sessionId` **EL SISTEMA DEBERA** responder 404 y no
   revelar si la sesion existe.

**Verify**

```bash
pnpm test tests/unit/evaluate-answer.test.ts # pasa: nueve nombres, rangos, razones y respuesta mejorada son obligatorios
pnpm test tests/integration/training-evaluation.test.ts # pasa: persistencia, fallo parcial y aislamiento por asesora
pnpm test:e2e tests/e2e/training-session.spec.ts # pasa: pregunta, formulario, scoring y version mejorada aparecen
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 10: simulator evaluation"
git tag step-10-simulator-evaluation
```

### Paso 11 — Copilot: sesion, intencion y composicion

**Do**

- Crear inicio/fin de `live_sessions`, clasificacion de `question_intent` y composicion desde producto
  mas reglas activas.
- El prompt sigue las seis partes de §8 y produce Express, estandar y profunda. La pagina inicia con
  Express seleccionada y estima duracion por palabras, con rango objetivo 15–20 s.
- Transmitir el texto. Instrumentar `time_to_first_token_ms` en el resultado y en la prueba; el
  presupuesto local con cliente falso es menor de 250 ms, mientras la metrica de produccion es p95
  menor de 2.5 s.

**Done when**

1. **CUANDO** una asesora abre `/app/copilot` **EL SISTEMA DEBERA** seleccionar `express` como vista
   inicial y mostrar su objetivo de 15–20 segundos.
2. **CUANDO** se envia una pregunta **EL SISTEMA DEBERA** clasificarla, transmitir una respuesta con
   las seis partes aplicables y emitir el primer token en menos de 250 ms con el cliente falso local.
3. **CUANDO** el Knowledge Hub o Business Brain no contiene un dato **EL SISTEMA DEBERA** decir que
   no esta verificado y no citar ni completar informacion externa.
4. **CUANDO** termina la composicion **EL SISTEMA DEBERA** persistir un `copilot_exchange` con
   variante, duracion, confianza, CTA, regla y alertas.

**Verify**

```bash
pnpm test tests/unit/copilot-compose.test.ts # pasa: intencion, seis partes, limites de conocimiento y presupuesto local
pnpm test tests/integration/copilot-session.test.ts # pasa: sesion e intercambio quedan atribuidos y trazados
pnpm test:e2e tests/e2e/copilot.spec.ts # pasa: Express es default, streaming conserva pregunta y error es recuperable
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 11: copilot composition"
git tag step-11-copilot-compose
```

### Paso 12 — Copilot: orquestacion y memoria comercial

**Do**

- Crear el orquestador puro que recibe CTAs disponibles, reglas activas, `ctas_used` y
  `promos_mentioned`; devuelve como maximo un CTA y un incentivo.
- No repetir el CTA inmediatamente anterior si existe alternativa. Persistir memoria solo cuando el
  intercambio termina correctamente.
- Crear `view-defaults.ts` y `answer-panel.tsx`; confianza nunca depende solo de color.

**Done when**

1. **CUANDO** el CTA anterior vuelve a ser candidato y existe una alternativa **EL SISTEMA DEBERA**
   seleccionar una alternativa.
2. **CUANDO** solo existe un CTA valido **EL SISTEMA DEBERA** poder repetirlo y nunca inventar otro.
3. **CUANDO** una regla comercial esta inactiva **EL SISTEMA DEBERA** excluirla de incentivos y de
   `promos_mentioned`.
4. **CUANDO** una composicion falla **EL SISTEMA DEBERA** dejar intacta la memoria de la sesion.

**Verify**

```bash
pnpm test tests/unit/copilot-orchestrator.test.ts # pasa: rotacion, maximos, fallback y promociones inactivas
pnpm test tests/unit/copilot-view-defaults.test.ts # pasa: express es el default exportado
pnpm test tests/integration/copilot-memory.test.ts # pasa: memoria cambia solo despues de un intercambio exitoso
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 12: copilot orchestration"
git tag step-12-copilot-orchestration
```

### Paso 13 — Comunicacion responsable y confianza

**Do**

- Crear `src/server/copilot/responsible.ts` como gate determinista posterior a la salida estructurada.
- Comparar afirmaciones contra allowed/caution/forbidden, verificacion y fuentes del producto.
- Embarazo, lactancia, medicamentos, enfermedad diagnosticada o riesgo de salud siempre fuerzan la
  ruta de cautela, recomendacion profesional y confianza `revisar`.
- Un refusal del modelo tambien produce `revisar`; nunca una respuesta vacia lista para leer.

**Done when**

1. **CUANDO** una pregunta menciona embarazo, lactancia, medicamentos o enfermedad **EL SISTEMA
   DEBERA** evitar una recomendacion afirmativa, sugerir consulta profesional y marcar `revisar`.
2. **CUANDO** una respuesta contiene un claim prohibido o terapeutico **EL SISTEMA DEBERA** bloquearlo
   antes de persistir `answer_text` y devolver una alerta nombrada.
3. **CUANDO** la ficha no esta verificada o falta una fuente **EL SISTEMA DEBERA** impedir confianza
   `alto`.
4. **CUANDO** el proveedor retorna refusal **EL SISTEMA DEBERA** entregar una respuesta segura de
   cautela y conservar el refusal en `llm_calls.finish_reason`.

**Verify**

```bash
pnpm test tests/unit/responsible-communication.test.ts # pasa: cautela, claims, fuentes y niveles se afirman por caso
pnpm test tests/integration/copilot-responsible.test.ts # pasa: contenido bloqueado no llega a answer_text y refusal queda trazado
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 13: responsible communication"
git tag step-13-responsible-communication
```

### Paso 14 — Live Intelligence: upload y transcripcion

Cargar `supabase` antes de crear el bucket y sus politicas. El bucket es privado; la ruta empieza por
el UUID de la asesora y RLS restringe select/insert/delete a ese propietario. No se usa upsert; si se
habilitara, harian falta INSERT + SELECT + UPDATE.

**Do**

- Crear upload a Storage, fila `live_recordings`, token aleatorio por grabacion y encolado REST a
  Deepgram con callback.
- Crear el handler de callback con comparacion en tiempo constante del secreto antes de leer el body,
  token por grabacion, Zod, estados y update condicional idempotente.
- Usar el fixture grabado de callback. Ningun gate llama a Deepgram real.

**Done when**

1. **CUANDO** una asesora sube un archivo permitido **EL SISTEMA DEBERA** guardarlo en un bucket
   privado bajo su UUID y crear una fila `uploaded` con expiracion.
2. **CUANDO** se encola la transcripcion **EL SISTEMA DEBERA** enviar callback, diarizacion, idioma y
   modelo configurados, y pasar la fila a `transcribing`.
3. **CUANDO** el callback lleva secreto invalido **EL SISTEMA DEBERA** responder 401 sin leer el body
   ni escribir filas.
4. **CUANDO** el mismo callback valido llega dos veces **EL SISTEMA DEBERA** responder 200 ambas veces
   y efectuar la transicion `transcribing → transcribed` una sola vez.

**Verify**

```bash
pnpm test tests/unit/deepgram-request.test.ts # pasa: request REST usa config, callback, idioma y diarizacion
pnpm test tests/integration/recording-upload.test.ts # pasa: ruta por propietaria, bucket privado y expiracion
pnpm test tests/integration/transcription-callback.test.ts # pasa: 401/404/422/200 e idempotencia cumplen §5
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 14: recording transcription"
git tag step-14-live-transcription
```

### Paso 15 — Live Intelligence: insights y promocion

**Do**

- Crear analisis estructurado del fixture de transcripcion en los seis tipos de `insight_type`.
- Persistir insights vinculados a grabacion/producto y crear promocion transaccional a
  `training_questions` con `source = 'live_insight'`.
- Hacer la promocion idempotente mediante `promoted_to_question_id`.
- Completar `/app/intelligence` con estados de la tuberia y alcance por asesora/admin.

**Done when**

1. **CUANDO** una grabacion transcrita se analiza **EL SISTEMA DEBERA** pasar por `analyzing`, crear
   insights validos y terminar en `analyzed`.
2. **CUANDO** se promueve un insight elegible **EL SISTEMA DEBERA** crear una pregunta con
   `source = 'live_insight'` y enlazar ambos registros en una transaccion.
3. **CUANDO** el mismo insight se promueve otra vez **EL SISTEMA DEBERA** devolver la pregunta ya
   enlazada y no crear otra.
4. **CUANDO** una transcripcion contiene PII **EL SISTEMA DEBERA** evitar copiar nombres o telefonos
   literales al texto del insight o a la pregunta promovida.

**Verify**

```bash
pnpm test tests/unit/analyze-transcript.test.ts # pasa: tipos, redaccion de PII y schema se validan con fixture
pnpm test tests/integration/live-insights.test.ts # pasa: estados, persistencia, promocion e idempotencia
pnpm test:e2e tests/e2e/live-intelligence.spec.ts # pasa: carga, pipeline, vacio, error e insights son observables
pnpm typecheck && pnpm lint && pnpm test # pasa: gate comun en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 15: live insights loop"
git tag step-15-live-insights
```

### Paso 16 — Dashboard, retencion, CI y despliegue

Antes de programar la retencion, cargar `supabase` y revisar `pg_cron` como alternativa. Se descarta
en v1 porque borrar el objeto de Storage tambien requiere la API de Storage; un cron de Vercel puede
reconciliar objeto, transcripcion y fila en un solo flujo. Postgres mantiene el advisory lock.

**Do**

- Crear el dashboard con los KPIs de §1, alcance por rol y fallos independientes por tarjeta.
- Crear `GET /api/cron/retention`, autorizacion en tiempo constante, advisory lock y borrado
  reconciliatorio de objetos/filas vencidos segun `RECORDING_RETENTION_DAYS`.
- Crear `.github/workflows/ci.yml` con install congelado, base de pruebas, migraciones y gate; crear
  `vercel.json` con el cron diario. Las migraciones de produccion son un job explicito anterior al
  deploy, nunca parte de `next build` ni del arranque.

**Done when**

1. **CUANDO** una asesora abre el dashboard **EL SISTEMA DEBERA** calcular metricas solo sobre su
   `advisor_id`; un admin recibe agregados de la organizacion y costo total.
2. **CUANDO** el cron recibe un bearer invalido **EL SISTEMA DEBERA** responder 401 y borrar cero
   objetos y filas.
3. **CUANDO** el cron procesa una grabacion vencida **EL SISTEMA DEBERA** borrar objeto, transcripcion,
   fila e insights, y una segunda ejecucion debera procesar cero.
4. **CUANDO** dos ejecuciones se solapan **EL SISTEMA DEBERA** permitir una y devolver `skipped: true`
   en la otra.
5. **CUANDO** CI corre sobre un checkout limpio **EL SISTEMA DEBERA** instalar el lockfile, migrar la
   base de pruebas y pasar typecheck, lint y tests antes de construir.

**Verify**

```bash
pnpm test tests/integration/dashboard.test.ts # pasa: alcance de KPIs, latencia y costo por rol
pnpm test tests/integration/retention.test.ts # pasa: 401, lock, borrado reconciliatorio e idempotencia
pnpm test:e2e tests/e2e/dashboard.spec.ts # pasa: tarjetas, estados independientes y rol son observables
pnpm build # pasa: Next produce el build sin ejecutar migraciones
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e # pasa: puerta local completa en verde
```

**Checkpoint**

```bash
git add -A && git commit -m "step 16: dashboard retention and deploy"
git tag step-16-deploy
```

### Un paso, una tarea, una unidad

En modo bundle, cada paso de arriba produce exactamente una tarea en `tasks.json` y un bloque en un
epic. Un epic contiene entre cinco y nueve tareas. Con dieciseis pasos, este bundle usa dos epics de
ocho tareas: Foundation (`E1-T1`…`E1-T8`) y Product Loop (`E2-T1`…`E2-T8`). La numeracion de tarea no
reemplaza las etiquetas `step-01-*`…`step-16-*`; ambas se copian literalmente.

---

## 10. Bootstrap

### Prerrequisitos

- Git 2.x, Docker con Compose v2, `psql`, curl y una shell bash.
- Node 24.19.0 segun `.nvmrc`; Corepack se habilita en un directorio escribible.
- Supabase CLI **>= 2.115.0**. El instalado hoy en la maquina de origen es 2.34.3 y no satisface el
  `config.toml`; se actualiza antes de ejecutar el bloque. No se adivinan comandos del CLI: primero
  `supabase --help` y `supabase <grupo> --help`.
- Cuentas de Anthropic, Deepgram, Supabase hospedado y Vercel solo para lanzamiento; ningun gate de
  construccion depende de ellas.

### Bootstrap idempotente

Este bloque se ejecuta desde la raiz del proyecto destino, con el bundle dentro de
`blueprints/super-store-sales-os/`. Se corre **verbatim dos veces seguidas**; ambas deben salir 0. No
usa `cp -Rn`, porque su camino de no-op no es portable. El scaffold corre en un directorio temporal
y solo sus archivos base faltantes entran al arbol existente.

```bash
set -euo pipefail

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack enable --install-directory "$HOME/.local/bin"
corepack prepare pnpm@11.22.0 --activate

BUNDLE_DIR="blueprints/super-store-sales-os"
test -d "$BUNDLE_DIR/workspace"

while IFS= read -r source; do
  relative="${source#${BUNDLE_DIR}/workspace/}"
  target="./${relative}"
  if [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    cp "$source" "$target"
  fi
done < <(find "$BUNDLE_DIR/workspace" -type f -print)

chmod +x scripts/check-supabase-cli.sh
pnpm supabase:check 2>/dev/null || scripts/check-supabase-cli.sh

if [ ! -f package.json ]; then
  scaffold_dir="$(mktemp -d)"
  trap 'rm -rf "$scaffold_dir"' EXIT
  pnpm create next-app@16.3.1 "$scaffold_dir/app" --ts --tailwind --biome --app --src-dir --import-alias '@/*' --use-pnpm --yes
  cp "$scaffold_dir/app/package.json" package.json
  cp "$scaffold_dir/app/postcss.config.mjs" postcss.config.mjs
  test -f src/app/layout.tsx || cp "$scaffold_dir/app/src/app/layout.tsx" src/app/layout.tsx
  test -f src/app/page.tsx || cp "$scaffold_dir/app/src/app/page.tsx" src/app/page.tsx
  test -f src/app/globals.css || cp "$scaffold_dir/app/src/app/globals.css" src/app/globals.css
fi

pnpm pkg set packageManager="pnpm@11.22.0"
pnpm pkg set engines.node=">=24.19.0 <25"
pnpm pkg set scripts.dev="next dev" scripts.build="next build" scripts.typecheck="tsc --noEmit"
pnpm pkg set scripts.lint="biome check ." scripts.format="biome check --write ."
pnpm pkg set scripts.test="vitest run" scripts.test:e2e="playwright test"
pnpm pkg set scripts.db:up="docker compose up -d --wait" scripts.db:down="docker compose down"
pnpm pkg set scripts.db:reset="docker compose down -v && docker compose up -d --wait"
pnpm pkg set scripts.db:generate="drizzle-kit generate" scripts.db:generate:custom="drizzle-kit generate --custom"
pnpm pkg set scripts.db:migrate="drizzle-kit migrate" scripts.db:migrate:test="DRIZZLE_TARGET=test drizzle-kit migrate"
pnpm pkg set scripts.db:studio="drizzle-kit studio" scripts.db:seed="tsx scripts/seed.ts"
pnpm pkg set scripts.env:local="tsx scripts/write-env-local.ts"
pnpm pkg set scripts.env:local:supabase="supabase status -o env > .supabase-status.env && tsx scripts/write-env-local.ts --from-supabase"
pnpm pkg set scripts.supabase:check="bash scripts/check-supabase-cli.sh"
pnpm pkg set scripts.supabase:start="pnpm supabase:check && supabase start" scripts.supabase:stop="supabase stop"

node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.pnpm={...(p.pnpm||{}),allowBuilds:{...(p.pnpm?.allowBuilds||{}),"@biomejs/biome":true,sharp:true,"unrs-resolver":true}};fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'

pnpm add --save-exact next@16.3.1 react@19.2.8 react-dom@19.2.8 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 drizzle-orm@0.45.2 postgres@3.4.9 @supabase/supabase-js@2.112.3 @supabase/ssr@0.12.4 @anthropic-ai/sdk@0.117.1 zod@4.4.3 react-hook-form@7.85.0 @hookform/resolvers@5.9.1 @tanstack/react-query@5.101.4
pnpm add --save-dev --save-exact typescript@6.0.3 @types/node@24.13.3 @types/react@19.2.18 @types/react-dom@19.2.4 @biomejs/biome@2.5.9 drizzle-kit@0.31.10 vitest@4.1.11 @playwright/test@1.62.1 tsx@4.23.12
pnpm approve-builds --all
pnpm install --frozen-lockfile

pnpm env:local
git init
git config user.name >/dev/null 2>&1 || git config user.name "Super Store Builder"
git config user.email >/dev/null 2>&1 || git config user.email "builder@super-store.local"
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "chore: bootstrap Super Store Sales OS"
fi
```

`create-next-app` puede salir 0 aunque la instalacion interna haya abortado con
`ERR_PNPM_IGNORED_BUILDS`; por eso el verdadero gate es `pnpm approve-builds --all` seguido de
`pnpm install --frozen-lockfile`. En pnpm 11 la clave es `allowBuilds`, no
`onlyBuiltDependencies`. `--eslint=false` es un no-op: se usa `--biome`. No se ejecuta `shadcn init`:
§2 eligio componentes propios; si esa decision cambiara, el unico comando no interactivo aceptable
seria `shadcn init --base radix --no-monorepo`.

---

## 11. Integraciones externas

### Pines y procedencia

Versiones verificadas el 2026-08-18 contra `dist-tags.latest` del registro npm, salvo Node contra su
indice oficial. Todos los paquetes los instala §10 y quedan exactos en `pnpm-lock.yaml`.

| Paquete | Pin | Uso |
|---|---:|---|
| Node | 24.19.0 | runtime LTS, `.nvmrc` |
| pnpm | 11.22.0 | package manager/Corepack |
| TypeScript | 6.0.3 exacto | compiler con API compatible con Drizzle Kit |
| Next | 16.3.1 | App Router |
| React / React DOM | 19.2.8 | UI |
| `@types/node` | 24.13.3 | tipos runtime Node 24 |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.4 | tipos UI |
| Tailwind / PostCSS plugin | 4.3.3 / 4.3.3 | estilos |
| Drizzle ORM / Kit | 0.45.2 / 0.31.10 | datos y migraciones |
| `postgres` | 3.4.9 | driver |
| Supabase JS / SSR | 2.112.3 / 0.12.4 | Auth y Storage con cookies |
| Anthropic SDK | 0.117.1 | unica integracion LLM |
| Zod | 4.4.3 | validacion y structured output |
| React Hook Form / resolvers | 7.85.0 / 5.9.1 | formularios grandes |
| TanStack React Query | 5.101.4 | cancelacion/reintento del Copilot |
| Biome | 2.5.9 | lint y formato |
| Vitest | 4.1.11 | unit/integration |
| Playwright | 1.62.1 | E2E Chromium |
| tsx | 4.23.12 | scripts TypeScript |

No se instala `shadcn`, un SDK de Deepgram, Prisma, dotenv, Sentry ni un cliente de Redis. TypeScript
7.0.2 era `latest`, pero no expone la API programatica que consume tooling; por eso 6.0.3 es un pin
exacto y no un rango.

### Anthropic

| Aspecto | Contrato |
|---|---|
| Cliente | `@anthropic-ai/sdk` 0.117.1, importado solo por `src/lib/ai/gateway.ts` |
| Modelo | `AI_MODEL_DEFAULT`; ningun call site contiene un id literal |
| Salida | `messages.parse()` + Zod; streaming donde una persona espera |
| Caching | bloque system estable con `cache_control: { type: 'ephemeral' }` |
| Refusal | revisar `stop_reason` antes de `content`; degradar a cautela |
| Telemetria | uso reportado, latencia, modelo, proposito, costo y prompt versionado |

El gateway activa fallback del servidor segun `.claude/rules/ai-gateway.md`, inyecta un cliente falso
en pruebas y limita concurrencia a cuatro por proceso. El clasificador usa inicialmente el mismo
modelo por defecto: bajar al tier pequeno exige un eval que no empeore el golden set.

### Deepgram

REST con `fetch`, sin SDK. El request solicita espanol LatAm, diarizacion y callback asincrono. El
callback recibe un secreto compartido en header mas token aleatorio por grabacion; ambos se validan
antes de aceptar la transcripcion. Retries del proveedor son normales y el update por estado los hace
idempotentes.

**UNVERIFIED — verificar contra la documentacion vigente de Deepgram antes de la primera llamada
real:** `DEEPGRAM_MODEL=nova-3`, `DEEPGRAM_LANGUAGE=es-419`, nombres exactos de los parametros de
diarizacion/callback, forma del payload y soporte del header custom. El fixture local fija el contrato
interno; no pretende certificar que el proveedor no haya cambiado.

### Supabase y Vercel

Supabase aporta Postgres, Auth y Storage. La app usa publishable key en navegador y secret key solo en
servidor; el Postgres de la app entra por pooler, mientras migraciones usan conexion directa. Vercel
sirve Next y dispara `GET /api/cron/retention`. Ninguno aplica migraciones automaticamente.

Pagos, email de producto, TikTok API, WhatsApp API y Realtime: **NO APLICA — son non-goals de v1**.

---

## 12. Pruebas

| Capa | Runner | Servicio | Responsabilidad |
|---|---|---|---|
| Unit | Vitest node | ninguno | validacion, orquestacion, gates responsables, prompts y gateway falso |
| Integration | Vitest | Postgres de Docker; Supabase local solo donde se nombra RLS/Auth/Storage | esquema, queries, acciones, idempotencia y aislamiento |
| E2E | Playwright Chromium | Next local + Supabase local | login y flujos de UI que cruzan paginas |

`tests/setup.ts` carga entorno y fuerza `DATABASE_URL`/`DIRECT_DATABASE_URL` a
`TEST_DATABASE_URL`; una prueba que necesita la API de Supabase local la usa por URL publica y lo
declara. `fileParallelism: false` evita que dos archivos truncando una base compartida se pisen.

Flujos E2E criticos: login/logout; shell por rol; CRUD del Knowledge Hub; inicio y evaluacion de una
sesion; Copilot con Express por defecto, streaming y error recuperable; pipeline de Live Intelligence;
dashboard por rol. El callback, retencion, costo y RLS se prueban en integracion porque el navegador
no agrega observabilidad.

Los fixtures son `tests/fixtures/deepgram-callback.json` y `tests/fixtures/transcript-live.txt`.
Contienen datos sinteticos sin PII real. El golden set inicial cubre prompts, pero **no bloquea CI**
hasta tener veinte casos reales y linea base, como dice §1.

No se prueba la calidad real de STT con un fixture, la latencia de red de Anthropic ni el resultado
comercial de una venta: **NO APLICA como gate local — requieren proveedores o datos de produccion**.

---

## 13. Rendimiento

1. **Copilot:** transmitir siempre; presupuesto de producto p95 al primer token < 2.5 s. El gate
   local usa cliente falso y exige <250 ms para detectar buffering accidental, no para simular red.
2. **Conexiones:** `DATABASE_URL` usa pooler transaccional y `postgres` desactiva prepared statements.
   Migraciones/scripts usan `DIRECT_DATABASE_URL`. Una conexion nueva por request esta prohibida.
3. **Consultas:** filtros de igualdad primero y tiempo despues en indices compuestos; todas las FKs y
   columnas `advisor_id` usadas por RLS llevan indice. Listas se ordenan en SQL con limite 200.
4. **RLS:** funciones estables envueltas en `select`, por ejemplo `(select auth.uid())`, para
   evaluarlas una vez por statement.
5. **Frontend:** Server Components por defecto, cero JS cliente para lectura simple, `next/font`, sin
   animar el streaming y sin actualizaciones optimistas.
6. **Grabaciones:** callback asincrono. No se mantiene una funcion serverless abierta durante la
   transcripcion ni se analiza audio en tiempo real.

No se agregan Redis, CDN de datos, particionado, read replicas ni una cola: **NO APLICA — el volumen
v1 no justifica operarlos**. Si una lista supera 500 filas o una consulta rompe su presupuesto, se
mide con `EXPLAIN (ANALYZE, BUFFERS)` antes de agregar infraestructura.

---

## 14. Seguridad

- **Identidad:** `getClaims()` verifica JWT en servidor; `getSession()` de Supabase no autoriza.
  `user_metadata` nunca decide rol. El perfil y rol canonicamente viven en `advisors`.
- **Autorizacion:** cada Server Action llama `requireRole()`; cada consulta privada recibe
  `advisor_id` verificado. RLS protege la Data API como segunda barrera.
- **Llaves:** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` puede llegar al navegador.
  `SUPABASE_SECRET_KEY`, Anthropic, Deepgram y cron jamas tienen prefijo `NEXT_PUBLIC_`, log o bundle.
- **Base:** RLS en toda tabla expuesta; `TO authenticated` mas predicado de propiedad; updates con
  SELECT, `USING` y `WITH CHECK`; nada usa `auth.role()` ni `SECURITY DEFINER` para tapar permisos.
- **Storage:** bucket privado, ruta bajo UUID, politicas por operacion. El secret key solo se usa en
  codigo confiable del servidor y salta RLS, por lo que tambien se filtra por propietaria.
- **Entradas:** Zod en cada borde; nombres de archivo normalizados, MIME/extension/tamano limitados;
  ninguna ruta construye SQL por interpolacion.
- **Callbacks:** secretos comparados en tiempo constante antes de body; token por grabacion; callback
  idempotente. El cron aplica el mismo patron bearer.
- **PII:** transcripciones y derivados expiran a 90 dias por defecto. Logs no contienen transcript,
  pregunta de salud, token, email ni body de proveedor.
- **Supply chain:** pines exactos, lockfile versionado, installs congelados y `allowBuilds` explicito.

Antes de produccion se corre el asesor de seguridad de Supabase y se revisan grants de Data API. Una
tabla creada por SQL puede no estar expuesta segun la configuracion del proyecto; grants y RLS son
controles separados y ambos deben coincidir.

---

## 15. Observabilidad

### Eventos y trazas

Los logs son JSON estructurado con `request_id`, `purpose`, `advisor_id` seudonimizado, estado,
duracion y codigo de error. Nunca incluyen secretos, prompts completos, respuestas de clienta,
transcripciones ni condiciones de salud. Cada llamada al modelo deja la fila canonicamente medible en
`llm_calls`; cada grabacion conserva `provider_request_id` para conciliacion.

### Metricas

| Metrica | Fuente | Alerta/uso |
|---|---|---|
| TTFT y latencia total por `purpose` | gateway + `llm_calls` | p95 Copilot >2.5 s durante 15 min |
| Error/refusal rate | `finish_reason`, `error` | cambio de prompt/modelo o ruta de cautela |
| Costo por grabacion | suma `cost_usd` por recording/purpose | objetivo <USD 3.00 |
| Cache read/write tokens | uso del proveedor | detectar prefijo inestable |
| Estados atascados | `live_recordings.status`, timestamps | transcribing/analyzing fuera de SLA |
| Uso en vivo | timestamps de exchange vs live session | validar que el Copilot se usa durante el live |

`GET /health` separa liveness (`ok: true`) de dependencia (`db: up|down`) y expone commit. No consulta
Anthropic, Deepgram ni Storage. Los dashboards de Vercel/Supabase ayudan a operar, pero la aceptacion
del build usa la base y pruebas locales, no una UI externa.

Sentry: **NO APLICA en v1 — logs de Vercel mas tablas de trazabilidad cubren diez usuarias**. Se
reconsidera si los errores no pueden reproducirse con `request_id` o si aparece un cliente publico.

---

## 16. Despliegue

### Entornos

| Entorno | App | Base | Auth/Storage | Migraciones |
|---|---|---|---|---|
| Test | proceso local | Docker `TEST_DATABASE_URL` | clientes falsos o Supabase local | `pnpm db:migrate:test` |
| Desarrollo | Next local | Supabase local directo/pooler | Supabase local | `pnpm db:migrate` |
| Preview | Vercel preview | proyecto Supabase no productivo | no datos reales | job explicito |
| Produccion | Vercel | Supabase hospedado | privado, signup off | job explicito antes del deploy |

CI instala con `pnpm install --frozen-lockfile`, levanta Postgres, migra test, corre typecheck/lint/test,
build y E2E. El deploy no migra al arrancar. En produccion el flujo es: backup/verificacion → job de
migracion directa → deploy de app → `/health` → smoke autenticado. Cambios destructivos usan
expand-then-contract en releases distintas.

Rollback de codigo: desplegar el commit/tag anterior. Rollback de datos: una migracion forward que
restaura compatibilidad; nunca editar ni revertir a ciegas una migracion aplicada. Cada paso de §9
tiene tag `step-NN-*` para rollback durante construccion.

El cron de Vercel llama `GET /api/cron/retention` diariamente. `pg_cron` se evaluo y se descarto para
v1 porque no puede completar por si solo el borrado coordinado en Storage. Dominio custom: **NO
APLICA — la URL interna de Vercel es suficiente para el piloto**.

---

## 17. Configuracion y variables de entorno

### Precedencia unica

De mayor a menor: **shell/CI → `.env.local` → `.env` → defaults seguros del script**.
`.env.example` es documentacion y **nunca se carga**. `src/lib/load-env.ts` recorre `.env.local` antes
de `.env` y no sobrescribe `process.env`; `scripts/write-env-local.ts` mezcla defaults, luego `.env`,
luego el `.env.local` existente. `--from-supabase` refresca deliberadamente las tres llaves locales
de Supabase y escribe el resultado en `.env.local`.

`.env` y `.env.local` pueden contener secretos y no se versionan. `.env.example` es la unica plantilla
exceptuada por `.gitignore`. El `.env` ya presente en este bundle contiene configuracion del usuario;
se preserva, se mantiene ignorado y no se copia a reportes.

### Variables

| Variable | Exposicion | Requerida desde | Proposito |
|---|---|---:|---|
| `DATABASE_URL` | servidor | paso 1 | pooler para requests de la app |
| `DIRECT_DATABASE_URL` | servidor/scripts | paso 1 | migraciones y scripts, nunca navegador |
| `TEST_DATABASE_URL` | test | paso 1 | Postgres de Docker |
| `NEXT_PUBLIC_SUPABASE_URL` | publica | paso 3 | API de Auth/Storage |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publica | paso 3 | key `sb_publishable_...` del cliente |
| `SUPABASE_SECRET_KEY` | secreto | paso 3 | key `sb_secret_...` para operaciones admin servidor |
| `ANTHROPIC_API_KEY` | secreto | paso 7 real | llamadas reales; gates usan cliente falso |
| `AI_MODEL_DEFAULT` | servidor | paso 7 | modelo principal |
| `AI_MODEL_SMALL` | servidor | paso 7 | candidato declarado, aun no enrutado |
| `AI_MAX_CONCURRENCY` | servidor | paso 7 | limite por proceso, default 4 |
| `SUPABASE_RECORDINGS_BUCKET` | servidor | paso 14 | bucket privado |
| `DEEPGRAM_API_KEY` | secreto | paso 14 real | REST de transcripcion |
| `DEEPGRAM_BASE_URL` | servidor | paso 14 | endpoint configurable |
| `DEEPGRAM_MODEL` | servidor | paso 14 | modelo STT no incrustado |
| `DEEPGRAM_LANGUAGE` | servidor | paso 14 | idioma STT no incrustado |
| `DEEPGRAM_CALLBACK_SECRET` | secreto | paso 14 | autenticacion del callback |
| `PUBLIC_BASE_URL` | servidor | paso 14 | callback publico |
| `CRON_SECRET` | secreto | paso 16 | bearer del cron |
| `RECORDING_RETENTION_DAYS` | servidor | paso 16 | default 90 |

El CLI local historicamente emite `ANON_KEY` y `SERVICE_ROLE_KEY`; el proyecto los mapea al escribir
`.env.local` a los nombres canonicos `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y
`SUPABASE_SECRET_KEY`. Produccion usa el esquema nuevo. **VERIFICAR contra la documentacion vigente de
Supabase antes de la primera llamada real** que el proyecto hospedado entregue `sb_publishable_` y
`sb_secret_`, y mantener soporte de aliases legados solo para Supabase local.

---

## 18. Skills para la fase de construccion

Dos skills oficiales de Supabase ya estan instaladas por el usuario en `.agents/skills/` y enlazadas
desde `.claude/skills/`:

| Skill | Version | Activacion | Pasos |
|---|---:|---|---|
| `supabase-postgres-best-practices` | 1.1.1 | automatica al tocar Postgres; sin `/` | 2 antes de la primera tabla, 3 para RLS, 16 para locks/cron |
| `supabase` | 0.1.2 | automatica al tocar Supabase; sin `/` | 3 Auth/RLS, 5 comportamiento Data API, 14 Storage, 16 alternativa `pg_cron` |

Escribir `/supabase` como si fuera comando es un no-op silencioso. En una maquina nueva se instalan a
nivel de proyecto con:

```bash
npx skills add supabase/agent-skills
```

Las skills se consultan antes de actuar, pero el blueprint y sus pruebas son autosuficientes: si una
skill no esta disponible, el builder sigue con documentacion oficial y los mismos gates. Las tres
skills especificas del proyecto emitidas en §19.4 (`add-migration`, `add-ai-call-site`,
`add-server-action`) codifican flujos repetibles y tampoco sustituyen los criterios de §9.

---

## 19. Archivos del workspace

El contenido de `blueprints/super-store-sales-os/workspace/` se copia una sola vez de forma
idempotente antes del paso 1. No es pseudocodigo: cada ruta de esta seccion existe en el bundle. El
builder preserva un archivo existente para no borrar trabajo del usuario.

### 19.1 `CLAUDE.md`

Fuente canonica de comandos, limites de arquitectura, diseno, entorno y no negociables. Declara el
gate comun, URLs por tipo de proceso, unica lectura de `process.env`, unico import del SDK y reglas de
comunicacion responsable. Ya esta emitido en `workspace/CLAUDE.md`.

### 19.2 `AGENTS.md`

Resumen corto para agentes que no cargan `CLAUDE.md` automaticamente: proposito, comandos, gate y diez
no negociables. Remite a `CLAUDE.md` para el detalle; no lo contradice. Ya esta emitido.

### 19.3 `.claude/settings.json`

Allowlist de comandos locales necesarios por §9: pnpm, Docker Compose, Supabase CLI, psql, curl, git y
lecturas de entorno. No habilita comandos destructivos amplios, no permite leer secretos fuera del
proyecto y no crea `.claude/commands/`.

### 19.4 Skills del proyecto

- `.claude/skills/add-migration/SKILL.md`: cambia schema, genera, revisa, migra test y verifica.
- `.claude/skills/add-ai-call-site/SKILL.md`: pasa por gateway, schema Zod, prompt versionado y ledger.
- `.claude/skills/add-server-action/SKILL.md`: Zod, `requireRole`, resultado tipado y prueba.

### 19.5 Reglas por area

`database.md`, `ai-gateway.md`, `responsible-communication.md`, `ui.md` y `testing.md` tienen globs de
aplicacion y repiten solo los invariantes que deben estar presentes mientras se edita esa area.

### 19.6 Config verify-critica e infraestructura local

| Ruta emitida | Propiedad que garantiza |
|---|---|
| `biome.json` | parser Tailwind v4 y exclusion `!blueprints/**` |
| `tsconfig.json` | strict, imports `.ts`, rewrite de extensiones y exclusion del bundle |
| `vitest.config.ts` | solo `tests/**/*.test.ts`, sin e2e/bundle, un archivo a la vez |
| `playwright.config.ts` | Chromium, puerto 3101 y health como readiness |
| `drizzle.config.ts` | carga env y selecciona directa dev/test con `DRIZZLE_TARGET` |
| `next.config.ts` | excluye `blueprints/**` del output tracing |
| `docker-compose.yml` | Postgres 17 de pruebas en 55432 con healthcheck |
| `supabase/config.toml` | Auth/Storage local, signup off, CLI >=2.115.0 |
| `tests/setup.ts` | nunca permite que Vitest toque la base de desarrollo |
| `src/lib/load-env.ts` | shell/CI > `.env.local` > `.env`; example no se carga |
| `scripts/write-env-local.ts` | genera `.env.local` y mapea keys nuevas/legadas |
| `scripts/check-supabase-cli.sh` | falla temprano si el CLI no entiende config.toml |
| `.env.example` | unica plantilla versionada, sin secretos |
| `.env` | configuracion real ignorada; encabezado corregido para decirlo |
| `.gitignore` | `.env*` ignorado y solo `!.env.example` exceptuado |
| `.nvmrc` | Node 24.19.0 |

Fixtures verify-criticos que los pasos 14 y 15 crean: `tests/fixtures/deepgram-callback.json` y
`tests/fixtures/transcript-live.txt`. `package.json`, `pnpm-lock.yaml` y `postcss.config.mjs` no se
emiten aqui: §10 los produce mediante el scaffold y la instalacion congelada.

### Matriz de reconciliacion

| Valor duplicado | Debe coincidir en |
|---|---|
| puerto test 55432 | compose, `.env.example`, script env |
| Supabase 54321/54322 | config.toml, `.env.example`, script env |
| puerto E2E 3101 | Playwright y redirect URL de Auth |
| `live-recordings` | `.env.example`, seed y politicas Storage |
| precedencia env | §17, `load-env.ts`, `write-env-local.ts`, CLAUDE |
| nombres de API keys | §17, ambos env, script env, `src/lib/env.ts`, auth |
| imports `.ts` | tsconfig, CLAUDE, reglas y codigo |
| exclusion `blueprints/` | Biome, TS, Vitest, Playwright y Next tracing |
| Express default | §1, §6, paso 11/12, view-defaults y prueba |

Correcciones aplicadas en este relanzamiento: `.env` ya declara que no se versiona; la precedencia es
unica e implementada; las llaves canonicas son publishable/secret con aliases locales legados; las
skills oficiales de Supabase se documentan como activacion automatica, sin sintaxis de slash.

---

## 20. Riesgos y puerta de calidad

### 20.1 Puerta de calidad ejecutable

Antes de considerar terminado el build:

```bash
# Desde la raiz del proyecto: el bootstrap completo debe ser idempotente.
bash blueprints/super-store-sales-os/bootstrap.sh # pasa: primera ejecucion sale 0
bash blueprints/super-store-sales-os/bootstrap.sh # pasa: segunda ejecucion sale 0 y es no-op seguro

pnpm db:up && pnpm db:migrate:test # pasa: la base de pruebas arranca desde cero y migra
pnpm supabase:start && pnpm env:local:supabase && pnpm db:migrate # pasa: Auth, RLS y Storage locales reciben el esquema
pnpm typecheck # pasa: cero errores TypeScript 6
pnpm lint # pasa: cero errores Biome, incluido Tailwind v4
pnpm test # pasa: cero fallos y cero pruebas skipped
pnpm build # pasa: build de produccion sin migracion implicita
pnpm test:e2e # pasa: flujos criticos locales en Chromium
pnpm db:seed && pnpm db:seed # pasa: ambas ejecuciones salen 0
test "$(rg -l '@anthropic-ai/sdk' src --glob '*.ts' --glob '*.tsx' | wc -l | tr -d ' ')" = "1" # pasa: un solo archivo importa el SDK
test -z "$(git status --porcelain)" # pasa: corre despues de todos los checkpoints y el arbol esta limpio
for tag in step-01-scaffold-health step-02-database-schema step-03-auth-rls step-04-app-shell step-05-knowledge-hub step-06-business-brain step-07-ai-gateway step-08-structured-output step-09-simulator-questions step-10-simulator-evaluation step-11-copilot-compose step-12-copilot-orchestration step-13-responsible-communication step-14-live-transcription step-15-live-insights step-16-deploy; do git rev-parse "$tag" >/dev/null || exit 1; done # pasa: cada rollback target existe
```

El bloque referencia `blueprints/super-store-sales-os/bootstrap.sh`; el bundle lo emite copiando
verbatim el bloque de §10 a ese archivo ejecutable al cerrar la generacion. Si no existe, la puerta
esta incompleta y el build no comienza.

Checklist de lanzamiento humano — deliberadamente fuera del gate autonomo:

- Verificar keys nuevas de Supabase y `enable_signup=false` en el proyecto hospedado.
- Validar parametros Deepgram con una grabacion real de español colombiano, musica y varias voces.
- Revisar las fichas iniciales y claims con la persona responsable de producto.
- Configurar variables Vercel, cron y migracion directa; ejecutar smoke autenticado.
- Confirmar aviso interno de tratamiento y retencion de transcripciones con la empresa.

### 20.2 Registro de riesgos

| Riesgo | Disparador observable | Mitigacion / aceptacion | Paso dueno |
|---|---|---|---:|
| La asesora no puede leer mientras esta en camara | abandona/copía menos respuestas largas; duracion excede el rango | Express 15–20 s por defecto, 20px, streaming sin movimiento | 11–12 |
| Latencia del Copilot | TTFT p95 ≥2.5 s | streaming, effort bajo/medio, caching estable, metrica por llamada | 7, 11 |
| Claims de salud o refusals | claim prohibido, pregunta cautelosa o `stop_reason=refusal` | gate determinista, profesional de salud, confianza `revisar` | 7, 13 |
| STT falla con español colombiano, ruido o varias voces | WER cualitativo impide extraer preguntas correctas | piloto real, diarizacion, estado fallido recuperable; no promover automaticamente | 14–15 |
| PII en transcripciones | aparecen nombres, telefonos o salud en texto | bucket privado, redaccion de derivados, retencion 90 dias y cron idempotente | 14–16 |
| Costo por live analizado | suma por grabacion ≥USD 3.00 | ledger desde primera llamada, caching y analisis por bloques medidos | 7, 15–16 |
| Knowledge Hub incorrecto amplifica el error | una ficha verificada contiene un dato falso | **Aceptado sin mitigacion barata:** revision humana, fuentes y `verified_at`; el sistema no puede validar verdad de negocio por si solo | 5 |

### 20.3 Registro de decisiones

1. El ciclo Training → Copilot → Intelligence es el producto; ninguno se separa como app.
2. Drizzle es unico dueño del esquema y las migraciones son un job explicito.
3. Postgres puro acelera pasos 1–2; Supabase local entra desde Auth en paso 3.
4. RLS y filtro de servidor conviven porque el driver del servidor puede saltar RLS.
5. Supabase Auth es por invitacion, email+contrasena, sin registro publico.
6. Anthropic queda detras de un gateway unico y cada llamada tiene costo atribuible.
7. Deepgram usa REST/callback; no se opera worker ni GPU.
8. Componentes propios sobre tokens Tailwind; shadcn se descarto para evitar reescritura de config y
   dependencias no necesarias.
9. Express es el default aunque el documento inicial llame estandar a 30–45 s: la condicion fisica de
   la asesora en camara manda.
10. Vercel Cron gana sobre `pg_cron` porque la retencion incluye Storage, no solo filas.
11. Keys canonicas nuevas de Supabase; aliases legados solo traducen salida del CLI local.
12. TypeScript queda exactamente en 6.0.3 hasta que Drizzle Kit soporte la nueva API de TS 7.

### 20.4 Siguiente corte despues de v1

No se empieza hasta que §20.1 este verde y el loop manual se use en lives reales. El primer trabajo
posterior es calibrar el golden set con al menos veinte casos, medir uso durante el live, TTFT, costo
por grabacion y calidad de insights. Solo esos datos deciden si bajar modelo, automatizar audio,
integrar TikTok o convertir evals en gate bloqueante.

### Log de supuestos

- Una sola empresa, 3–10 asesoras y un admin; no hay tenant ni sede adicional.
- El computador corre junto al telefono que transmite; la pregunta se teclea manualmente.
- La empresa puede descargar y cargar la grabacion de TikTok.
- `RECORDING_RETENTION_DAYS=90` es default operativo, sujeto a confirmacion empresarial antes del
  lanzamiento.
- El proyecto hospedado entregara keys `sb_publishable_`/`sb_secret_`; se verifica antes de uso real.
- Los parametros Deepgram siguen sin verificar hasta el smoke real indicado.

**Blocking gaps: none.** Los dos puntos no verificables localmente — parametros Deepgram y keys del
proyecto hospedado — estan aislados en el checklist de lanzamiento y no bloquean la construccion con
fixtures y Supabase local.
