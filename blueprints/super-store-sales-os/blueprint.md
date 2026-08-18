# Super Store Sales OS — Blueprint

> Generado por The Architect el 2026-08-18
> Shape: internal-tool · `knowledge/shapes/internal-tool.md`
> Runtime track: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Modo de emision: bundle
> Version del blueprint: 1
> Versiones verificadas por ultima vez: 2026-08-18 — procedencia por paquete en §11

---

## 1. Vision general y Non-Goals

### Vision

Super Store vende suplementos dietarios por TikTok Live en Colombia. El resultado de cada
transmision depende hoy del talento individual de la asesora que este en camara: la que conoce bien
el producto vende, la que no, improvisa. Super Store Sales OS convierte ese conocimiento tacito en un
proceso repetible. Una sola fuente de verdad — el Knowledge Hub, con la ficha verificada de cada
producto, y el Business Brain, con las reglas comerciales vigentes — alimenta tres modulos: Training
Simulator entrena a la asesora antes del live, Live Copilot le da la respuesta lista para decir
durante el live, y Live Intelligence analiza la grabacion despues y devuelve al Simulator las
preguntas y objeciones que realmente aparecieron.

El ciclo es el producto. Sin Live Intelligence el entrenamiento se basa en suposiciones; sin el
Knowledge Hub los otros dos modulos inventan; sin el Copilot el conocimiento se queda en la
capacitacion y no llega al momento de venta. Lo que se esta construyendo no es un chatbot de producto:
es el estandar comercial de la empresa, escrito en una base de datos, con trazabilidad de cada
afirmacion y un limite duro sobre lo que se puede decir de un suplemento.

### Usuarias

| Persona | A que viene | Frecuencia |
|---|---|---|
| Asesora comercial (3–10 personas) | Entrenar antes del live, resolver preguntas de clientas durante el live, revisar su desempeno despues | Diaria en dias de transmision |
| Administrador (1 persona) | Cargar y verificar fichas de producto, ajustar reglas comerciales y promociones, crear cuentas, revisar KPIs y costo | Semanal, y antes de cada campana |

### Objetivos — alcance v1

1. El sistema mantiene una ficha de producto verificada y editable con beneficios priorizados, FAQs,
   objeciones, diferenciales, precauciones y claims permitidos/con-cautela/prohibidos, con fuentes.
2. El sistema mantiene reglas comerciales configurables — envio gratis, promocion del live,
   invitaciones a TikTok y WhatsApp, cupones — sin que ningun valor quede en el codigo.
3. El sistema genera preguntas de clienta por producto, con intencion y dificultad, y evalua la
   respuesta de la asesora en nueve dimensiones, explicando cada puntaje y entregando una version
   mejorada de la respuesta.
4. El sistema compone, durante el live, una respuesta lista para decir en tres duraciones, con la
   Express de 15–20 s como vista por defecto, mostrando duracion estimada, nivel de confianza, CTA
   usado, regla comercial aplicada y alertas.
5. El sistema recuerda, dentro de una sesion de live, que CTAs y promociones ya se dijeron, y no
   repite el mismo CTA en dos respuestas consecutivas cuando hay alternativas.
6. El sistema transcribe una grabacion de live cargada manualmente, extrae insights tipificados y
   permite promover un insight a pregunta de entrenamiento.
7. El sistema registra el costo y la latencia de cada llamada al modelo, atribuidos a una asesora y a
   un proposito, desde la primera llamada.

### Non-Goals — explicitamente fuera del alcance v1

El builder **no debe implementar nada de esta tabla**, ni siquiera como anadido pequeno mientras
trabaja en un paso adyacente. Si un paso parece requerir un non-goal, eso es un defecto del blueprint:
detente y reportalo en vez de expandir el alcance.

| No se construye | Por que no ahora | Se revisa cuando |
|---|---|---|
| Integracion con la API de TikTok Live | Requiere aprobacion de plataforma y un contrato de datos que no controlamos; el flujo manual valida el mismo loop | El loop manual se use en 10 lives consecutivos y el cuello de botella medido sea la carga manual |
| Escucha automatica del audio en tiempo real | Latencia y costo de STT continuo sobre dos horas con musica de fondo, para un beneficio no validado | El Copilot se use en vivo (no solo despues) y las asesoras pidan dejar de teclear la pregunta |
| Dictado por voz en el Copilot | Anade una superficie de error justo donde la latencia es el requisito | Se mida que teclear la pregunta cuesta mas de 10 s en promedio |
| CRM y automatizacion de WhatsApp | Es un producto distinto con su propio modelo de datos y sus propias obligaciones de PII | Exista un dueno de la relacion post-venta dentro de Super Store |
| Analitica de atribucion de ventas | Requiere datos de transaccion que este sistema no tiene y no debe tener todavia | Se conecte una fuente de ordenes confiable |
| Grafo de conocimiento sobre el catalogo | Con 1–3 productos, una tabla con `complement_product_ids` da el 100% del valor a 5% del costo | El catalogo pase de ~50 productos y las consultas cruzadas sean frecuentes |
| App movil nativa | La asesora usa el computador mientras transmite desde el telefono; una app movil competiria con la transmision | Cambie el setup fisico de las transmisiones |
| Realtime / websockets | Un dashboard con refresco manual cubre el caso; realtime es una superficie de fallo sin flujo que lo exija | Un flujo declarado se rompa sin actualizacion viva |
| Exportes CSV | Diez usuarias y tres productos no generan un volumen que justifique un escritor de streaming | Alguien pida el mismo reporte tres veces |
| Multi-sede o separacion por equipo | Una sola sede, un solo equipo; el aislamiento por asesora ya esta resuelto con RLS | Se abra una segunda sede o entre un equipo externo |
| Evals automatizados como gate bloqueante de CI | El golden set se siembra en v1, pero bloquear CI con una metrica sin linea base calibrada frena el build sin proteger nada | El golden set tenga ≥20 casos reales de produccion y una linea base medida |
| Audit log inmutable y bulk actions | Patrones del shape `internal-tool` pensados para decenas de operadores sobre millones de filas. Con 10 usuarias y 3 productos, hincharian el alcance sin reducir riesgo | El equipo pase de ~25 personas o entre una obligacion de cumplimiento que lo exija |
| Paginacion sobre millones de filas y saved views | Mismo motivo: el volumen real de v1 cabe en una pantalla | Una lista pase de ~500 filas |

### Metricas de exito

| Metrica | Objetivo | Como se mide |
|---|---|---|
| Latencia al primer token del Copilot | p95 < 2.5 s | `select percentile_cont(0.95) within group (order by latency_ms) from llm_calls where purpose = 'copilot_compose'` |
| Uso del Copilot en vivo vs. despues | ≥50% de los `copilot_exchanges` de una sesion creados entre `started_at` y `ended_at` de esa `live_sessions` | Consulta comparando timestamps; es la medida directa del riesgo #1 |
| Costo por grabacion analizada | < USD 3.00 al 2026-11-30 | `select sum(cost_usd) from llm_calls where purpose = 'analyze_recording' group by recording` |
| Insights promovidos a entrenamiento | ≥10 preguntas con `source = 'live_insight'` al 2026-11-30 | `select count(*) from training_questions where source = 'live_insight'` |
| Mejora medida en el Simulator | El promedio de `scores` de la 3a sesion de una asesora supera el de su 1a sesion en ≥15% | Consulta sobre `training_answers` agrupada por `session_id` |

---

## 2. Stack tecnologico

**Runtime track: ts-node.** Esta tabla nombra *decisiones*, no versiones. Cada pin vive en §11 y en
ningun otro lugar de la prosa.

Los pines vienen del reporte de `stack-researcher` producido en esta sesion, que es la autoridad.
`knowledge/runtime-tracks/ts-node.md` es el respaldo para lo que ese reporte no resolvio, y sus
salvedades no verificadas se arrastran textualmente.

| Capa | Eleccion | Por que esta, y no la otra |
|---|---|---|
| Lenguaje / runtime | TypeScript sobre Node.js LTS | Un solo lenguaje en servidor, cliente, scripts y pruebas. Se rechazo Python: el producto es UI mas llamadas a un modelo, no trabajo numerico |
| Framework | Next.js App Router | Server Components dejan la clave de Anthropic y la conexion a Postgres del lado servidor sin escribir una capa de API. Se rechazo Vite+Hono: dos deploys y un contrato HTTP que aqui no aporta nada |
| Estilos | Tailwind CSS v4, configurado en CSS | Densidad y velocidad, que es lo que pide una herramienta interna. v4 mueve los tokens al bloque `@theme`: una sola fuente de verdad en CSS en vez de un archivo JS paralelo |
| Capa de componentes | Componentes propios sobre los tokens de `@theme` | Se rechazo shadcn/ui: su `init` reescribe `globals.css` y `tsconfig.json`, que este blueprint emite, y arrastra cuatro paquetes que esta sesion no verifico. Ver §20.3 decision 8 |
| Base de datos | Postgres, hospedado en Supabase | Necesitamos `jsonb` para las fichas y `uuid[]` para complementos, mas RLS por fila. Se rechazo SQLite: RLS y la API de Storage son parte del producto |
| ORM / acceso a datos | Drizzle ORM con el driver `postgres` | El esquema en TypeScript es la fuente de verdad y las migraciones son SQL legible. Se rechazo Prisma: no necesitamos un cliente generado ni un GUI, y Drizzle deja escribir el SQL de RLS a mano |
| Auth | Supabase Auth, solo por invitacion | La sesion ya esta en el contexto de las politicas de RLS: la integracion mas estrecha disponible. Se rechazaron better-auth y Clerk: un segundo proveedor de identidad sobre la misma base es la razon de este acoplamiento |
| Trabajo en background | Callback asincrono de Deepgram + un cron de Vercel | El callback evita montar un worker: subir a Storage, crear la fila, llamar a Deepgram con `callback`, y Deepgram hace POST cuando termina. Se rechazo una cola: no hay volumen que la justifique |
| Pagos | NO APLICA | Herramienta interna. Las usuarias trabajan para la empresa; no hay registro publico ni facturacion |
| Almacenamiento de archivos | Supabase Storage, bucket privado | Ya esta en la plataforma que tiene la identidad y las politicas. Se rechazo S3: una credencial y un proveedor mas para el mismo archivo |
| Email / notificaciones | Email transaccional de Supabase Auth (solo invitaciones) | Es lo unico que se necesita en v1. Se rechazo Resend: no hay ningun correo de producto todavia |
| Transcripcion (STT) | Deepgram REST, espanol LatAm, con diarizacion y callback | Claude no transcribe audio. Se rechazo Whisper autohospedado: seria operar GPUs para tres grabaciones por semana |
| Modelo de lenguaje | Anthropic SDK detras de un unico modulo gateway | Features del proveedor el dia que salen, y portabilidad real porque la costura es *nuestra* interfaz. Se rechazo un router multi-proveedor: parametros al minimo comun denominador y un dominio de fallo mas |
| Hosting | Vercel | Cero configuracion para Next, y cron nativo para el job de retencion. Se rechazo autohospedar: no hay quien opere el contenedor |
| Gestor de paquetes | pnpm | `node_modules` estricto: atrapa dependencias fantasma antes del deploy |

### Chequeo de compatibilidad

Verificado contra `knowledge/stack-compatibility.md`. **No hay combinaciones conocidas-malas en este
stack**, y las cinco reglas duras que ese archivo impone sobre esta combinacion estan codificadas asi:

1. **Un solo dueno del esquema: Drizzle.** El editor de esquema del dashboard de Supabase es de solo
   lectura desde el dia uno. Dos sistemas de migracion sobre una base es una combinacion
   conocida-mala. Escrito en `.claude/rules/database.md` y en §19.1 como no negociable.
2. **Pooler para la app, URL directa para migraciones y scripts.** Conexiones por request en
   serverless contra Postgres sin pooler agotan conexiones en el primer pico, y el sintoma parece una
   base lenta sin serlo. Dos variables separadas en §17, y `drizzle.config.ts` solo lee la directa.
3. **Migraciones como paso explicito de despliegue, nunca al arrancar la app.** Instancias
   concurrentes compiten. En §16 son un job de CI separado del build.
4. **Biome + Tailwind v4 necesita `"css": { "parser": { "tailwindDirectives": true } }`** en
   `biome.json` **antes** del primer `lint`, o el parseo muere sobre el `globals.css` que genero el
   propio scaffolder. Es error de parseo, no regla de lint: `--write` no lo arregla. La clave ya esta
   en el `biome.json` que §19.6 emite, y el copiado de `workspace/` ocurre antes del paso 1.
5. **Un solo proveedor de identidad: Supabase Auth.** No se agrega better-auth ni Clerk.

### CAUTION — TypeScript 6, no 7

`pnpm add -D typescript` instala hoy **la linea 7.x**, que es la reescritura en Go. TypeScript 7 no
expone todavia una API de compilador programatica estable. `next build` la tolera porque invoca el
`tsc` local, pero **rompe todo el tooling que embebe TypeScript como libreria — incluido Drizzle
Kit**, que es como se generan y aplican las migraciones de este proyecto.

Por eso §11 fija la version **exacta** de la linea 6.x, sin caret. **Nadie debe "actualizar"
TypeScript en este proyecto sin antes verificar que Drizzle Kit funciona con la version nueva.** Un
caret aqui convierte una actualizacion de rutina en un build sin migraciones.

---

## 3. Estructura de directorios

```
super-store-sales-os/
  .claude/                          # workspace del agente — llega copiando blueprints/*/workspace/ (§19)
    settings.json                   # allowlist de permisos: cubre cada comando de verificacion del §9
    rules/
      database.md                   # convenciones de esquema, migraciones, RLS, semillas
      ai-gateway.md                 # parametros de la API, caching, persistencia de uso
      responsible-communication.md  # limites de claims de salud — es un gate, no una guia
      ui.md                         # tokens de Tailwind v4, accesibilidad, layout del Copilot
      testing.md                    # unitarias vs integracion vs E2E
    skills/
      add-migration/SKILL.md
      add-ai-call-site/SKILL.md
      add-server-action/SKILL.md
  .github/
    workflows/ci.yml                # el mismo gate del §20.1 — creado en el paso 16
  blueprints/
    super-store-sales-os/           # ESTE bundle. Excluido en cada config que camina el arbol (§19.6)
  drizzle/                          # migraciones SQL generadas, versionadas. Nombres los pone drizzle-kit
  scripts/
    check-supabase-cli.sh           # gate de version del CLI de Supabase (§19.6)
    write-env-local.ts              # genera y actualiza .env.local, idempotente (§19.6)
    seed.ts                         # semillas idempotentes + bucket de Storage — paso 2
  src/
    app/
      globals.css                   # @import "tailwindcss" + bloque @theme: unica fuente de tokens
      layout.tsx                    # root layout, fuente Inter via next/font
      page.tsx                      # redirige a /login o al dashboard
      health/route.ts               # GET /health — liveness + probe de base
      login/
        page.tsx                    # entrada por email + password. NO existe ruta de registro
        actions.ts                  # server action de ingreso
      (app)/
        layout.tsx                  # shell autenticado: sidebar filtrado por rol + header
        app/                         # segmento URL explicito `/app`
          page.tsx                  # Inicio / Dashboard de KPIs — paso 16
          training/
            page.tsx                # Training Simulator: elegir producto, generar preguntas
            [sessionId]/page.tsx    # responder, ver scoring de 9 dimensiones y respuesta mejorada
          copilot/page.tsx          # Live Copilot: columna de entrada + columna de salida
          intelligence/page.tsx     # Live Intelligence: subir grabacion, ver insights
          knowledge/
            page.tsx                # Knowledge Hub: lista de fichas
            [id]/page.tsx           # editar una ficha
          settings/page.tsx         # Configuracion comercial (Business Brain) + cuentas
      api/
        transcription-callback/route.ts  # POST de Deepgram cuando termina — verifica secreto
        cron/retention/route.ts          # GET del cron de Vercel: borra lo vencido
    components/
      layout/nav-items.ts           # funcion pura visibleNavItems(role) — probada en unitarias
      copilot/answer-panel.tsx      # panel de salida; vista Express por defecto
    db/
      schema.ts                     # ESQUEMA DRIZZLE — unica fuente de verdad de las tablas
      client.ts                     # unico lugar que abre una conexion a Postgres
    lib/
      env.ts                        # process.env parseado con zod. Nadie mas lee process.env
      load-env.ts                   # carga .env.local para drizzle-kit, vitest y tsx (§19.6)
      auth.ts                       # clientes Supabase + getSession() verificada por getClaims() + requireRole()
      copilot/view-defaults.ts      # la vista Express es el default. Tiene prueba dedicada
      validation/
        product.ts                  # esquemas zod del Knowledge Hub
        commercial-rule.ts          # esquemas zod del Business Brain
      ai/
        config.ts                   # ids de modelo y precios, leidos de env. Nunca en un call site
        gateway.ts                  # UNICO archivo que importa @anthropic-ai/sdk
        structured.ts               # messages.parse() + un reintento de reparacion
        schemas.ts                  # esquemas zod de salida del modelo
        prompts/
          generate-questions.ts
          evaluate-answer.ts
          copilot.ts
          analyze-transcript.ts
    server/
      advisors.ts                   # unico escritor de advisors; garantiza id == id de auth.users
      products.ts                   # server actions del Knowledge Hub
      commercial-rules.ts           # server actions del Business Brain
      llm-calls.ts                  # unico escritor de llm_calls
      insights.ts                   # insights + promocion a training_questions
      training/
        questions.ts
        evaluate.ts
      copilot/
        session.ts                  # live_sessions y memoria de CTAs
        compose.ts                  # clasificacion de intencion + composicion de respuesta
        orchestrator.ts             # motor de orquestacion comercial (rotacion de CTAs)
        responsible.ts              # gate de comunicacion responsable + nivel de confianza
      recordings/
        upload.ts                   # a Supabase Storage
        transcription.ts            # encolado en Deepgram + verificacion del callback
        analyze.ts                  # transcripcion -> insights
  supabase/
    config.toml                     # config del stack local. ESCRITO PARA CLI >= 2.115.0 (§19.6)
  tests/
    setup.ts                        # carga env y fuerza TEST_DATABASE_URL (§19.6)
    fixtures/
      transcript-live.txt           # transcripcion de ejemplo — paso 15
      deepgram-callback.json        # payload de callback de ejemplo — paso 14
    unit/                           # logica pura, sin nada externo
    integration/                    # contra el Postgres de docker-compose.yml
    e2e/                            # contra el dev server de Next
  .env.example                      # cada clave, con de donde sacarla. Se versiona (§19.6)
  .gitignore                        # incluye `!.env.example` DESPUES de `.env*` (§19.6)
  .nvmrc                            # version de Node
  biome.json                        # lint + format. tailwindDirectives + exclusion de blueprints/
  docker-compose.yml                # Postgres puro para migraciones y pruebas (§19.6)
  drizzle.config.ts                 # importa load-env.ts. Solo la URL directa (§19.6)
  next.config.ts                    # excluye blueprints/ del tracing (§19.6)
  package.json                      # lo GENERA el scaffold en §10. Ningun paso del §9 lo escribe
  playwright.config.ts              # testDir tests/e2e + webServer (§19.6)
  postcss.config.mjs                # generado por el scaffold: @tailwindcss/postcss
  proxy.ts                          # NO middleware.ts. La funcion exportada es `proxy`
  tsconfig.json                     # alias, allowImportingTsExtensions, exclude blueprints (§19.6)
  vitest.config.ts                  # include tests/**, exclude blueprints/** y e2e (§19.6)
  CLAUDE.md                         # §19.1
  AGENTS.md                         # §19.2
```

**Reglas de frontera**

- Nada en `src/app/` importa de la carpeta de otra ruta. Lo compartido se mueve a `src/lib/` o
  `src/components/`.
- `src/db/client.ts` es el unico lugar que abre una conexion a Postgres.
- `src/lib/env.ts` es el unico lugar que lee `process.env`. Todo lo demas importa de ahi.
- `src/lib/ai/gateway.ts` es el unico archivo que importa `@anthropic-ai/sdk`. Una prueba lo verifica.
- `src/server/**` nunca importa React ni nada de `src/components/`.
- `src/components/**` nunca importa `src/server/` ni `src/db/`.
- **Especificadores de import:** relativos, siempre con extension `.ts` / `.tsx`. Esta es una
  *convencion de resolucion* y esta reconciliada contra los cuatro contextos que cargan estos modulos
  en la **matriz de convencion de resolucion de §19.6** — no se repite aqui.

**Origen de cada archivo del arbol.** Un arbol es documentacion: dibujar un archivo aqui no lo crea.
Cada archivo de arriba tiene exactamente uno de dos origenes: lo escribe un paso del §9 y aparece por
nombre en su lista **Do** y en el `files` de su tarea, o se emite como archivo real bajo `workspace/`
(§19.6) y llega al proyecto con el unico copiado que el builder corre antes del paso 1. Los archivos
marcados `(§19.6)` son del segundo tipo. `package.json` y `postcss.config.mjs` los genera el comando
de scaffold dentro del bloque Bootstrap de §10.

---

## 4. Modelo de datos

### Entidades

**`advisors`** — espeja los usuarios de Supabase Auth. Vive desde que un admin crea la cuenta hasta
que la desactiva; nunca se borra, porque sus sesiones de entrenamiento y sus grabaciones referencian
la fila.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK | **Iguala** el id del usuario en Supabase Auth, sin FK a `auth.users`. Ver la nota de portabilidad abajo |
| `email` | text | not null, unique | El mismo con el que ingresa |
| `display_name` | text | not null | Como aparece en el dashboard y en los KPIs |
| `role` | enum `advisor_role` | not null, default `asesor` | `asesor` \| `admin` |
| `status` | enum `advisor_status` | not null, default `activa` | `activa` \| `inactiva`. Inactiva no puede ingresar |
| `created_at` | timestamptz | not null, default now() | |

> **Portabilidad del esquema:** `advisors.id` **no** lleva llave foranea a `auth.users`. Una FK al
> esquema `auth` acopla las migraciones a la plataforma y las vuelve inaplicables sobre un Postgres
> puro — que es exactamente donde corren las pruebas y el gate del paso 2. La igualdad la garantiza el
> unico escritor, `src/server/advisors.ts`, y la afirma una prueba de integracion.

**`products`** — la ficha del Knowledge Hub. Es la fuente de verdad de todo lo que los tres modulos
pueden afirmar. Vive editada continuamente; `verified_at` marca la ultima revision humana.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `name` | text | not null | Nombre comercial como lo dice la asesora |
| `brand` | text | not null | |
| `category` | text | not null | |
| `presentation` | text | not null | Por ejemplo "frasco 60 capsulas" |
| `format` | text | not null | Capsula, polvo, liquido |
| `active_ingredients` | jsonb | not null, default `[]` | `[{ name, amount_per_serving?, unit?, verified }]`. La cantidad por porcion **solo si esta verificada**; si no, se omite el campo |
| `benefits` | jsonb | not null, default `[]` | **Exactamente 3**, priorizados: `[{ rank, claim, science_note, evidence_level }]` con `evidence_level` en `alta` \| `media` \| `baja`. Validado por zod, no por un constraint |
| `faqs` | jsonb | not null, default `[]` | `[{ question, answer }]` |
| `objections` | jsonb | not null, default `[]` | `[{ objection, response }]` |
| `differentiators` | jsonb | not null, default `[]` | `[{ claim, evidence }]` — solo verificables |
| `precautions` | text | not null, default '' | Texto libre que el gate de cautela lee |
| `claims_allowed` | jsonb | not null, default `[]` | Lista de strings que si se pueden decir |
| `claims_caution` | jsonb | not null, default `[]` | Se pueden decir con la ruta de cautela |
| `claims_forbidden` | jsonb | not null, default `[]` | **Dato, no texto de prompt**: una asesora los corrige sin tocar codigo |
| `complement_product_ids` | uuid[] | not null, default `{}` | Venta cruzada. Un array en vez de un grafo: 3 productos |
| `sources` | jsonb | not null, default `[]` | `[{ label, url? , note? }]`. Sin fuente, `evidence_level` no puede ser `alta` |
| `verified_at` | timestamptz | nullable | Null = ficha sin verificar. Baja el nivel de confianza de toda respuesta que la use |
| `created_at` | timestamptz | not null, default now() | |
| `updated_at` | timestamptz | not null, default now() | |

**`commercial_rules`** — el Business Brain. Separado del conocimiento de producto a proposito: una
promocion cambia sin reescribir ninguna ficha.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `key` | text | not null, unique | Clave estable que el codigo consulta por nombre |
| `value` | jsonb | not null | Forma libre por regla. Nunca hardcodeada en el codigo |
| `active` | boolean | not null, default true | Una promocion inactiva **no se menciona jamas** |
| `updated_at` | timestamptz | not null, default now() | |

Claves sembradas: `originalidad` (importados de EE.UU., sin afirmar certificaciones no verificadas),
`envio_gratis` (umbral en COP, **configurable**, sembrado en 120000), `promo_live` (promocion
exclusiva del live; solo se menciona si `active`), `seguir_tiktok`, `canal_whatsapp`,
`cupon_por_seguir`.

**`training_questions`** — el banco de preguntas del Simulator. Crece por semilla, por generacion del
modelo y por promocion de un insight de un live real.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `product_id` | uuid | FK → `products.id`, on delete cascade, not null | |
| `text` | text | not null | La pregunta como la haria una clienta |
| `intent` | enum `question_intent` | not null | `informacion` \| `comparacion` \| `precio` \| `confianza` \| `uso` \| `compra` \| `seguridad` \| `objecion` |
| `difficulty` | enum `question_difficulty` | not null | `basica` \| `intermedia` \| `dificil` |
| `ideal_answer` | text | not null | La referencia contra la que se evalua |
| `criteria` | jsonb | not null, default `[]` | Que debe contener una buena respuesta |
| `source` | enum `question_source` | not null | `seed` \| `generated` \| `live_insight` |
| `created_at` | timestamptz | not null, default now() | |

**`training_sessions`** — una tanda de entrenamiento de una asesora sobre un producto. `finished_at`
nulo significa en curso.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `advisor_id` | uuid | FK → `advisors.id`, on delete cascade, not null | Alcance de RLS |
| `product_id` | uuid | FK → `products.id`, on delete restrict, not null | Restrict: no se pierde historia por borrar una ficha |
| `started_at` | timestamptz | not null, default now() | |
| `finished_at` | timestamptz | nullable | |

**`training_answers`** — una respuesta y su evaluacion. Es donde vive el scoring de nueve dimensiones.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `session_id` | uuid | FK → `training_sessions.id`, on delete cascade, not null | |
| `question_id` | uuid | FK → `training_questions.id`, on delete restrict, not null | |
| `advisor_answer` | text | not null | Lo que escribio la asesora |
| `scores` | jsonb | not null | Las nueve dimensiones, cada una `{ score: 1..5, reason }` |
| `feedback` | text | not null | Explicacion global |
| `improved_answer` | text | not null | **Obligatorio.** Una nota sola es un defecto |
| `created_at` | timestamptz | not null, default now() | |

**Las nueve dimensiones de scoring**, nombradas — el sistema explica *por que* otorgo cada puntaje y
entrega una version mejorada de la respuesta: `conocimiento_producto`, `claridad_explicacion`,
`naturalidad_cercania`, `uso_responsable_evidencia`, `manejo_objeciones`, `capacidad_persuasion`,
`uso_cta`, `duracion`, `cumplimiento_reglas_marca`. Las claves del `jsonb` son exactamente esos nueve
nombres, y una prueba los afirma **por nombre**, no por conteo.

**`live_sessions`** — la memoria de sesion del Copilot. Es lo que permite no repetir un CTA.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `advisor_id` | uuid | FK → `advisors.id`, on delete cascade, not null | Alcance de RLS |
| `started_at` | timestamptz | not null, default now() | |
| `ended_at` | timestamptz | nullable | Null = live en curso |
| `ctas_used` | jsonb | not null, default `[]` | `[{ cta, at }]` en orden. El orquestador lo lee |
| `promos_mentioned` | jsonb | not null, default `[]` | `[{ rule_key, at }]` |

**`copilot_exchanges`** — cada pregunta de clienta y la respuesta compuesta. Es la traza del modulo.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `live_session_id` | uuid | FK → `live_sessions.id`, on delete cascade, not null | |
| `product_id` | uuid | FK → `products.id`, on delete restrict, nullable | Null si la pregunta no era de un producto |
| `customer_question` | text | not null | |
| `intent` | enum `question_intent` | not null | Mismo enum que `training_questions` |
| `answer_text` | text | not null | Lista para decir |
| `length_variant` | enum `length_variant` | not null, default `express` | `express` \| `estandar` \| `profunda`. El default de la tabla espeja el default de la UI |
| `duration_estimate_s` | integer | not null | Estimada de la respuesta generada |
| `confidence` | enum `confidence_level` | not null | `alto` \| `medio` \| `revisar` |
| `cta_used` | text | nullable | Null si la respuesta no llevaba CTA |
| `rule_applied` | text | nullable | `commercial_rules.key` aplicada |
| `alerts` | jsonb | not null, default `[]` | `[{ code, message }]` del gate de comunicacion responsable |
| `created_at` | timestamptz | not null, default now() | |

**`live_recordings`** — una grabacion cargada a mano, su transcripcion y el estado de la tuberia.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `advisor_id` | uuid | FK → `advisors.id`, on delete cascade, not null | Alcance de RLS |
| `storage_path` | text | not null | Ruta dentro del bucket privado de Supabase Storage |
| `status` | enum `recording_status` | not null, default `uploaded` | `uploaded` \| `transcribing` \| `transcribed` \| `analyzing` \| `analyzed` \| `failed` |
| `transcript` | text | nullable | Contiene **PII de clientas**: nombres, telefonos, condiciones de salud |
| `duration_s` | integer | nullable | Lo reporta el proveedor de STT |
| `provider_request_id` | text | nullable | Para conciliar con Deepgram |
| `callback_token` | text | not null | Secreto por grabacion. El endpoint lo compara en tiempo constante |
| `created_at` | timestamptz | not null, default now() | |
| `expires_at` | timestamptz | not null | `created_at + RECORDING_RETENTION_DAYS`. El cron borra por aqui |

**`insights`** — lo que Live Intelligence extrajo de una transcripcion, y el puente de vuelta al
Simulator.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `recording_id` | uuid | FK → `live_recordings.id`, on delete cascade, not null | |
| `type` | enum `insight_type` | not null | `faq` \| `objecion` \| `error` \| `oportunidad` \| `buena_practica` \| `riesgo_claim` |
| `text` | text | not null | Nunca una cita textual como evidencia dura: la transcripcion es imperfecta |
| `product_id` | uuid | FK → `products.id`, on delete set null, nullable | |
| `frequency` | integer | not null, default 1 | Cuantas veces aparecio en el live |
| `promoted_to_question_id` | uuid | FK → `training_questions.id`, on delete set null, nullable | No nulo = ya se promovio |
| `created_at` | timestamptz | not null, default now() | |

**`llm_calls`** — una fila por llamada al modelo, con el uso **reportado por el proveedor**. Existe
desde la primera llamada, no cuando llegue la sorpresa en la factura.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `advisor_id` | uuid | FK → `advisors.id`, on delete set null, nullable | Set null: la traza sobrevive al borrado |
| `purpose` | text | not null | `copilot_classify`, `copilot_compose`, `generate_questions`, `evaluate_answer`, `analyze_recording` |
| `model` | text | not null | El id que efectivamente se uso |
| `latency_ms` | integer | not null | |
| `input_tokens` | integer | not null | |
| `output_tokens` | integer | not null | |
| `cache_read_tokens` | integer | not null, default 0 | La metrica que hace visible el caching |
| `cache_write_tokens` | integer | not null, default 0 | |
| `cost_usd` | numeric(12,6) | not null | Calculado desde el uso reportado y los precios de config |
| `finish_reason` | text | not null | Incluye `refusal` |
| `error` | text | nullable | |
| `prompt_id` | uuid | FK → `prompts.id`, on delete set null, nullable | Nombra el prompt exacto |
| `created_at` | timestamptz | not null, default now() | |

**`prompts`** — el prompt versionado, para que una traza pueda nombrar el que la produjo.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `name` | text | not null | `copilot_compose`, `evaluate_answer`, … |
| `version` | integer | not null | |
| `body` | text | not null | El cuerpo de la plantilla tal como se envio |
| `active` | boolean | not null, default false | Uno activo por `name` |
| `created_at` | timestamptz | not null, default now() | |

Unique compuesto en `(name, version)`.

### Relaciones

- `advisors` —(1:N)→ `training_sessions` · cascade on delete
- `advisors` —(1:N)→ `live_sessions` · cascade on delete
- `advisors` —(1:N)→ `live_recordings` · cascade on delete
- `advisors` —(1:N)→ `llm_calls` · **set null** on delete (la traza sobrevive a la persona)
- `products` —(1:N)→ `training_questions` · cascade on delete
- `products` —(1:N)→ `training_sessions` · **restrict** on delete (no se pierde historia)
- `products` —(1:N)→ `copilot_exchanges` · **restrict** on delete
- `products` —(1:N)→ `insights` · **set null** on delete
- `training_sessions` —(1:N)→ `training_answers` · cascade on delete
- `training_questions` —(1:N)→ `training_answers` · **restrict** on delete
- `training_questions` —(0:1)← `insights.promoted_to_question_id` · set null on delete
- `live_sessions` —(1:N)→ `copilot_exchanges` · cascade on delete
- `live_recordings` —(1:N)→ `insights` · cascade on delete
- `prompts` —(1:N)→ `llm_calls` · set null on delete

La regla detras de la eleccion: **cascade cuando la fila hija no significa nada sin la madre**
(respuestas de una sesion), **restrict cuando borrar destruiria historia** (un producto con
entrenamientos), **set null cuando la traza debe sobrevivir** (llamadas al modelo, insights).

### Indices

| Tabla | Indice | Para que consulta |
|---|---|---|
| `advisors` | `(email)` unique | Login y la conciliacion con Supabase Auth |
| `products` | `(verified_at)` | El Knowledge Hub lista primero lo no verificado |
| `commercial_rules` | `(key)` unique | El Business Brain se consulta por clave, no por id |
| `training_questions` | `(product_id, intent)` | Generar una tanda balanceada por intencion |
| `training_questions` | `(source)` | La metrica de insights promovidos |
| `training_sessions` | `(advisor_id, started_at desc)` | Historial de la asesora y la metrica de mejora |
| `training_answers` | `(session_id)` | Cargar una sesion completa |
| `live_sessions` | `(advisor_id, started_at desc)` | Encontrar el live en curso |
| `copilot_exchanges` | `(live_session_id, created_at desc)` | Memoria de CTAs y la metrica de uso en vivo |
| `live_recordings` | `(advisor_id, created_at desc)` | Lista de Live Intelligence |
| `live_recordings` | `(status)` | El cron y el dashboard buscan por estado |
| `live_recordings` | `(expires_at)` | El job de retencion barre por aqui |
| `insights` | `(recording_id, type)` | Agrupar insights de una grabacion |
| `llm_calls` | `(purpose, created_at desc)` | Costo y latencia por feature (§15) |
| `llm_calls` | `(advisor_id, created_at desc)` | Economia unitaria por asesora |
| `prompts` | `(name, version)` unique | Un solo prompt por nombre y version |

### Esquema

El esquema real se escribe en `src/db/schema.ts` con Drizzle en el paso 2. Los enums de Postgres que
declara, con sus valores exactos:

```sql
-- Enums. Los valores son parte del contrato: la UI y los prompts los usan literalmente.
create type advisor_role        as enum ('asesor', 'admin');
create type advisor_status      as enum ('activa', 'inactiva');
create type question_intent     as enum ('informacion', 'comparacion', 'precio', 'confianza',
                                         'uso', 'compra', 'seguridad', 'objecion');
create type question_difficulty as enum ('basica', 'intermedia', 'dificil');
create type question_source     as enum ('seed', 'generated', 'live_insight');
create type length_variant      as enum ('express', 'estandar', 'profunda');
create type confidence_level    as enum ('alto', 'medio', 'revisar');
create type recording_status    as enum ('uploaded', 'transcribing', 'transcribed',
                                         'analyzing', 'analyzed', 'failed');
create type insight_type        as enum ('faq', 'objecion', 'error', 'oportunidad',
                                         'buena_practica', 'riesgo_claim');
```

Las tablas son exactamente las doce descritas arriba: `advisors`, `products`, `commercial_rules`,
`training_questions`, `training_sessions`, `training_answers`, `live_sessions`, `copilot_exchanges`,
`live_recordings`, `insights`, `llm_calls`, `prompts`. **El gate del paso 2 afirma cada tabla por
nombre**, una invocacion de `\d` por entidad, en vez de contar cuantas hay: un conteo se rompe en cada
edicion del esquema y la propiedad que importa es que exista cada una.

### Migraciones

Herramienta: **drizzle-kit**. `src/db/schema.ts` es la fuente de verdad; `pnpm db:generate` emite el
SQL a `drizzle/` y `pnpm db:migrate` lo aplica.

- **Nunca se escribe el nombre de un archivo de migracion en este blueprint ni en el codigo.**
  drizzle-kit los nombra con un sufijo aleatorio y un numero de secuencia que depende de cuantas
  migraciones ya existan. Se habla de "la migracion que emite `pnpm db:generate`" y se verifica el
  efecto en la base, no el nombre.
- **Nunca se edita a mano una migracion generada, ni una que ya corrio.** La unica excepcion son las
  creadas con `pnpm db:generate:custom`, que nacen **vacias** precisamente para escribir SQL que
  Drizzle no genera: politicas de RLS, indices parciales, triggers. Esa excepcion es explicita y no se
  extiende a las demas — es la reconciliacion del "no editar migraciones a mano" con el hecho de que
  el SQL de RLS se escribe a mano.
- **Regla de produccion: expand-then-contract.** Nunca una migracion destructiva en el mismo deploy
  que el cambio de codigo. Primero se agrega lo nuevo y el codigo lo tolera; en un deploy posterior se
  quita lo viejo.
- **Las migraciones son un paso explicito de despliegue, jamas al arrancar la app.** Instancias
  concurrentes compiten. En §16 son un job separado del build.
- Dos destinos, un solo comando parametrizado por `DRIZZLE_TARGET`: `pnpm db:migrate` va a
  `DIRECT_DATABASE_URL` (desarrollo) y `pnpm db:migrate:test` va a `TEST_DATABASE_URL` (el Postgres de
  `docker-compose.yml`). El esquema es identico en ambas; la diferencia es que las politicas de RLS
  solo se aplican a la base de Supabase, porque dependen de `auth.uid()`.

### Datos semilla

`scripts/seed.ts`, corrido con `pnpm db:seed`. **Idempotente**: se corre dos veces seguidas sin
duplicar nada (upsert por clave natural u `on conflict do nothing`). Siembra:

1. Un admin en `advisors`, con el id del usuario que crea en Supabase Auth via la secret key.
2. Las seis `commercial_rules` con `envio_gratis` en 120000 COP y `promo_live` **inactiva** (una
   promocion que no esta activa no se menciona jamas).
3. Los nueve `prompts` iniciales, version 1, con `active = true` uno por `name`.
4. Un producto de ejemplo completo con sus **tres** beneficios priorizados, para que la app sea usable
   en el primer arranque y para que el Simulator tenga contra que generar.
5. Cuatro `training_questions` con `source = 'seed'`, una por cada dificultad mas una de `seguridad`
   que dispara la ruta de cautela — el caso que el gate del paso 13 necesita.
6. El bucket privado de Supabase Storage `live-recordings` (ignorando el error de "ya existe").

Los pasos 1 y 6 necesitan el stack de Supabase corriendo y se saltan con un aviso si no lo esta, para
que `pnpm db:seed` siga sirviendo contra el Postgres puro en los pasos 1 y 2.

---

## 5. Diseno de la API

La superficie principal de este producto son **Server Actions**, no una API REST: no hay cliente
externo, y una capa HTTP intermedia solo agregaria un contrato que mantener. Solo tres route handlers
existen, y existen porque algo fuera del navegador los llama.

### Convenciones

- **Base path:** las Server Actions no tienen path. Los route handlers viven en `/health` y bajo
  `/api/`.
- **Envelope de respuesta — una sola forma, sin excepciones.** Toda Server Action retorna:
  ```ts
  type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: { code: ErrorCode; message: string; field?: string } };
  ```
  `message` es texto en espanol apto para mostrar. `field` solo aparece en errores de validacion y
  nombra el campo del formulario. **Nunca se lanza un string** y nunca llega a la UI un mensaje crudo
  del driver de Postgres.
- **Codigos de error — el conjunto enumerado completo:**

| `code` | Significado | Estado HTTP equivalente en un route handler |
|---|---|---|
| `VALIDATION` | La entrada no paso el esquema de zod. Lleva `field` | 422 |
| `UNAUTHENTICATED` | No hay sesion | 401 |
| `FORBIDDEN` | Hay sesion pero el rol no alcanza | 403 |
| `NOT_FOUND` | El recurso no existe o no es de esta asesora | 404 |
| `CONFLICT` | Choque con un unique, o una transicion de estado invalida | 409 |
| `PROVIDER_REFUSAL` | El modelo rehuso (`stop_reason: "refusal"`) | 200 con `ok: false` |
| `PROVIDER_UNAVAILABLE` | Timeout, 429 o sobrecarga del proveedor. Reintentable | 503 |
| `PROVIDER_MALFORMED` | `parsed_output` nulo tras el reintento de reparacion | 502 |
| `INTERNAL` | Todo lo demas. Se registra con id de peticion y no se detalla a la UI | 500 |

- **Validacion:** `zod`. Los esquemas de entrada viven en `src/lib/validation/`; los de salida del
  modelo en `src/lib/ai/schemas.ts`. Los tipos se infieren con `z.infer`, nunca se declaran dos veces.
- **Paginacion:** no aplica en v1. Ninguna lista supera ~500 filas (tres productos, diez asesoras) y
  paginar sobre eso es un non-goal de §1. Las listas se ordenan en la base con `order by` y un `limit`
  defensivo de 200.
- **Idempotencia:** solo `/api/transcription-callback` la necesita, porque Deepgram puede reintentar.
  Se logra por estado, no por una tabla de deduplicacion: la transicion `transcribing → transcribed`
  se aplica una sola vez con un `update ... where status = 'transcribing'`, y un segundo callback
  identico afecta cero filas y responde 200.
- **Rate limits:** no hay superficie publica que limitar. El unico limite es el **cap de concurrencia
  del gateway de IA** (`AI_MAX_CONCURRENCY`, default 4 en `src/lib/ai/config.ts`), para que una
  asesora analizando una grabacion de dos horas no consuma el limite de la organizacion mientras otra
  esta en vivo. El cron y el callback se protegen con secreto compartido, no con rate limit.

### Rutas

| Metodo | Path | Que hace | Auth | Limite |
|---|---|---|---|---|
| GET | `/health` | Liveness del proceso y probe de la base. Responde `{"ok":true,...}` | publica | ninguno |
| POST | `/api/transcription-callback` | Recibe la transcripcion terminada de Deepgram | secreto compartido + token por grabacion | ninguno |
| GET | `/api/cron/retention` | Borra grabaciones, transcripciones e insights vencidos | `Authorization: Bearer $CRON_SECRET` | uno por dia, con lock |

Todo lo demas es una Server Action en `src/server/**`, autorizada con `requireRole()` antes del
trabajo.

### Endpoints criticos — detalle completo

#### `GET /health`

Sin request body. Respuesta 200, exactamente esta forma:

```json
{ "ok": true, "db": "up", "commit": "unknown" }
```

`db` es `"up"` si `select 1` contra `DATABASE_URL` retorna, `"down"` si falla. **`ok` es `true`
mientras el proceso responda, incluso con `db: "down"`** — un liveness que se cae cuando la base se
cae hace que el orquestador reinicie el contenedor equivocado. `commit` es `env.VERCEL_GIT_COMMIT_SHA`
o `"unknown"` en local — la inyecta la plataforma en el build, y como toda variable pasa por
`src/lib/env.ts`, que es el unico lugar que lee `process.env` (§3). El route handler la importa
desde ahi, no desde el entorno.

Efectos secundarios: ninguno. Nunca requiere sesion, porque es lo que el gate del paso 1 y el
`webServer` de Playwright usan para saber que el servidor arranco.

> **Nota de forma, porque un gate la afirma:** el paso 1 verifica con
> `curl -sf http://127.0.0.1:3100/health | grep -q '"ok":true'`. Eso es una asercion de subcadena
> sobre JSON producido por `NextResponse.json`, que serializa con `JSON.stringify` y por tanto sin
> espacios. La subcadena `"ok":true` es estable independientemente de la version del runtime y del
> orden de las otras claves. En el paso 1 `db` todavia no existe; el paso 2 agrega la clave y la
> asercion del paso 1 sigue pasando, que es por lo que se afirma la subcadena y no el documento
> completo.

#### `POST /api/transcription-callback`

Request: el payload de Deepgram, mas dos credenciales. El secreto compartido llega en el header
`x-callback-secret` y el token por grabacion en el query string `?token=<callback_token>`.

Reglas de validacion, en este orden:
1. `x-callback-secret` se compara con `DEEPGRAM_CALLBACK_SECRET` en **tiempo constante**. Si no
   coincide: **401**, cero escrituras, y no se parsea el body.
2. `token` se busca en `live_recordings.callback_token`. Si no existe: **404**, cero escrituras.
3. El body se parsea con un esquema de zod tolerante que extrae el texto de la transcripcion y la
   duracion. Si falla: **422**, y la fila pasa a `status = 'failed'` con el error registrado —
   preferimos una grabacion marcada como fallida a una que se queda en `transcribing` para siempre.
4. `update live_recordings set status = 'transcribed', transcript = ..., duration_s = ...
   where callback_token = $1 and status = 'transcribing'`.

Casos de error y efectos:

| Situacion | Estado | Efecto |
|---|---|---|
| Secreto invalido o ausente | 401 | Ninguno. El body no se lee |
| Token desconocido | 404 | Ninguno |
| Body que no parsea | 422 | `status = 'failed'` |
| Camino feliz | 200 | Una fila pasa a `transcribed` con la transcripcion |
| **El mismo callback repetido** | 200 | **Cero filas afectadas.** El `where status = 'transcribing'` ya no aplica. El conteo de filas `transcribed` para ese token queda en 1 |

#### `GET /api/cron/retention`

**Es GET a proposito, no POST.** Vercel Cron emite `GET`; un endpoint que solo exporta `POST` devuelve
405 a cada invocacion, el schedule se ve saludable en el dashboard, y el unico sintoma es que el
trabajo nunca ocurre. Este handler exporta `GET` y nada mas.

Autorizacion: `Authorization: Bearer <CRON_SECRET>`, comparado en tiempo constante. Sin el, **401**.

Comportamiento, **reconciliatorio y no incremental** porque Vercel puede tanto saltarse como duplicar
una ejecucion, y nunca reintenta un fallo:
1. Toma un advisory lock de Postgres. Si otro corre, responde 200 con `{ ok: true, data: { skipped: true } }`.
   Un job largo puede solaparse con su propia siguiente invocacion.
2. Selecciona `live_recordings where expires_at < now()`.
3. Por cada una: borra el objeto de Storage, pone `transcript = null`, y borra la fila (los `insights`
   caen por cascade).
4. Responde 200 con cuantas proceso.

Es idempotente: correrlo dos veces seguidas procesa cero la segunda vez.

---

## 6. Arquitectura del frontend

### Rutas

| Ruta | Pagina | Fuente de datos | Auth |
|---|---|---|---|
| `/` | Redireccion | ninguna | publica → redirige a `/login` o `/app` |
| `/login` | Ingreso por email + password | Server Action | publica. **No existe ruta de registro** |
| `/health` | route handler, no pagina | `select 1` | publica |
| `/app` | Inicio / Dashboard de KPIs | consulta de servidor | asesora |
| `/app/training` | Training Simulator: elegir producto, generar preguntas | consulta + Server Action | asesora |
| `/app/training/[sessionId]` | Responder, ver scoring y respuesta mejorada | consulta + Server Action | asesora, solo sus sesiones |
| `/app/copilot` | Live Copilot | Server Action con streaming | asesora |
| `/app/intelligence` | Live Intelligence: subir grabacion, ver insights | consulta + Server Action | asesora, solo sus grabaciones |
| `/app/knowledge` | Knowledge Hub: lista de fichas | consulta de servidor | asesora lee; admin escribe |
| `/app/knowledge/[id]` | Editar una ficha | consulta + Server Action | admin |
| `/app/settings` | Configuracion comercial + cuentas | consulta + Server Action | admin |

Las rutas autenticadas viven en el grupo `(app)`, que es una frontera de layout y **no** un segmento
de URL. El directorio hijo `app/` si es el segmento explicito: por eso
`src/app/(app)/app/copilot/page.tsx` sirve `/app/copilot`. `src/app/(app)/layout.tsx` envuelve todas
esas paginas sin cambiar sus URLs.

### Estrategia de renderizado

- **Todo es dinamico por sesion.** No hay ninguna ruta estatica: cada pantalla depende de quien
  ingreso y de datos que cambian. No se usa `export const revalidate` en ninguna parte, y no se
  declara `cacheComponents`.
- `/health` es un route handler dinamico, `export const dynamic = "force-dynamic"`, porque un
  liveness cacheado no es un liveness.
- El **Dashboard de KPIs** tampoco se cachea. La tentacion es `"use cache"`, porque son agregados
  que no cambian entre dos recargas — pero esa directiva la habilita justamente el flag
  `cacheComponents` que el punto anterior dice que no se declara, y el `next.config.ts` emitido en
  §19.6 no lo declara. Mandar la directiva y no habilitar el flag es pedirle al builder que escriba
  codigo que la propia configuracion de este blueprint rechaza. Los agregados se calculan por
  consulta directa en cada carga: con seis tablas y decenas de filas el costo es despreciable, y
  cachear se evalua cuando exista una medicion que lo justifique.
- El Copilot **transmite** la respuesta. La accion devuelve un stream que la pagina consume; el panel
  de salida es un componente cliente que lo lee. La clave de Anthropic nunca sale del servidor.
- `next/font` carga Inter en el root layout. Nota del track que se respeta: `next/font` emite reglas
  `@font-face` de respaldo **sin** `font-display` y ninguna opcion lo cambia, asi que ningun criterio
  de aceptacion de este blueprint exige `font-display` sobre el CSS construido. Se afirma
  `display: "swap"` en el call site del loader, que es lo que si controlamos.

### Jerarquia de componentes

Live Copilot — la pantalla que decide si el producto sirve:

```
app/(app)/app/copilot/page.tsx                      [server]
├── CopilotForm                                 [client] — necesita estado de formulario
│   ├── ProductSelect                           [client]
│   ├── QuestionTextarea                        [client]  — pregunta de la clienta
│   ├── ObjectiveSelect                         [client]
│   ├── LengthToggle                            [client]  — default: express
│   ├── ToneSelect                              [client]
│   ├── ActivePromoBadge                        [server] — leido de commercial_rules
│   └── GenerateButton                          [client]
└── components/copilot/answer-panel.tsx         [client] — lee el stream
    ├── AnswerText                              — respuesta lista para decir, tipografia grande
    ├── DurationEstimate                        — duracion estimada en segundos
    ├── ConfidenceBadge                         — alto / medio / revisar, con color y texto
    ├── CtaUsedRow                              — CTA usado
    ├── RuleAppliedRow                          — regla comercial aplicada
    ├── AlertsList                              — alertas del gate de comunicacion responsable
    └── ActionsBar                              — Copiar / Regenerar / Mas corto / Cambiar tono
```

Training Simulator — sesion de respuesta:

```
app/(app)/app/training/[sessionId]/page.tsx         [server] — carga sesion y preguntas
├── QuestionCard                                [server] — texto, intencion, dificultad
├── AnswerForm                                  [client] — la respuesta de la asesora
└── EvaluationPanel                             [server] — tras enviar
    ├── ScoreGrid                               — las nueve dimensiones, cada una con su razon
    ├── FeedbackBlock                           — explicacion global
    └── ImprovedAnswerBlock                     — la version mejorada. Obligatoria
```

La regla es la misma en todas: **Server Component hasta que necesite estado o un handler**, y
`"use client"` en la hoja mas pequena — nunca en un layout ni en una page.

### Manejo de estado

- **Estado de servidor:** Server Components leyendo Postgres directo. `@tanstack/react-query` se usa
  **solo** en el panel del Copilot, para el reintento y la cancelacion de la generacion — que es el
  unico lugar con una peticion que la usuaria quiere abortar y repetir. En ninguna otra pantalla hay
  cliente de datos.
- **Estado de cliente:** `useState` local por formulario. `react-hook-form` con resolver de zod en los
  dos formularios grandes: la ficha de producto del Knowledge Hub y el formulario del Copilot.
- **Actualizaciones optimistas:** ninguna. En un producto donde la respuesta se lee en camara, mostrar
  algo que todavia no se confirmo es peor que esperar 300 ms.
- **Deliberadamente fuera de estado global:** la sesion (el wrapper `getSession()` verifica claims
  en el servidor en cada peticion), los tokens de diseno (son CSS), y las reglas comerciales (se
  leen de la base en el
  servidor, no se cachean en el cliente, porque una promocion desactivada tiene que dejar de
  mencionarse de inmediato).

### Estados de carga, vacio y error

Toda lista y toda superficie asincrona declara los tres. Ausentes, son el hueco mas comun de una UI
construida por un agente.

| Superficie | Cargando | Vacio | Error |
|---|---|---|---|
| Knowledge Hub (lista) | tres tarjetas esqueleto | "Aun no hay fichas. Crea la primera para que el Simulator y el Copilot tengan de donde leer." + boton | "No se pudieron cargar las fichas." + Reintentar |
| Ficha de producto (form) | inputs deshabilitados | no aplica | error por campo, en texto, junto al input |
| Training Simulator | "Generando preguntas…" con boton deshabilitado | "Este producto no tiene preguntas todavia. Genera una tanda." | "No se pudieron generar preguntas." + Reintentar |
| Panel de evaluacion | "Evaluando tu respuesta…" | no aplica | "No se pudo evaluar. Tu respuesta quedo guardada." |
| Copilot (salida) | texto llegando en streaming, con `aria-live="polite"` | "La respuesta aparece aqui. Escribe la pregunta de la clienta y presiona Generar." | "No se pudo generar. Intenta de nuevo." + Reintentar, **y la pregunta se conserva** |
| Live Intelligence (lista) | filas esqueleto | "Sube la grabacion de un live para ver que preguntaron y que se puede mejorar." | "No se pudieron cargar las grabaciones." |
| Insights de una grabacion | "Analizando…" con el estado de la tuberia visible | "El analisis no encontro insights en esta grabacion." | el `status = 'failed'` se muestra con el motivo |
| Dashboard de KPIs | cinco tarjetas esqueleto | "Todavia no hay datos suficientes." | cada tarjeta falla sola; una no tumba la pagina |

El caso de error del Copilot es el unico con una regla extra: **la pregunta escrita nunca se pierde**.
Perderla en camara es el peor momento posible para volver a teclear.

---

## 7. Sistema de diseno

Debe sentirse como software SaaS profesional y muy simple: la complejidad se esconde detras de la
interfaz. Densidad y velocidad por encima de animacion. Cada valor de abajo es un literal.

**Modo oscuro: no se implementa en v1.** La herramienta se usa de dia, en un computador, junto a una
transmision; un segundo tema es una superficie de diseno y de pruebas que no reduce ningun riesgo del
§20.2. La columna Dark queda en `—` a proposito, no por omision.

### Colores

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--primary` | `#5B21B6` | — | Botones primarios, enlaces, estados activos |
| `--primary-deep` | `#4C1D95` | — | Encabezados, estado activo, anillo de foco |
| `--primary-fg` | `#FFFFFF` | — | Texto sobre primario |
| `--support-blue` | `#1E3A8A` | — | Acentos informativos, graficas del dashboard |
| `--background` | `#F8FAFC` | — | Fondo de pagina |
| `--surface` | `#FFFFFF` | — | Tarjetas, paneles, popovers |
| `--border` | `#E2E8F0` | — | Divisores **no esenciales** unicamente |
| `--border-control` | `#64748B` | — | Contorno de inputs, selects y controles |
| `--fg` | `#0F172A` | — | Texto de cuerpo |
| `--fg-muted` | `#475569` | — | Texto secundario, leyendas |
| `--destructive` | `#DC2626` | — | Errores, borrar, borde de "Revisar" |
| `--success` | `#16A34A` | — | Confirmaciones, borde de "Alto" |
| `--warning` | `#CA8A04` | — | **Relleno decorativo unicamente.** Ver la nota abajo |
| `--warning-border` | `#A16207` | — | Borde y texto de advertencia accesible |
| `--confidence-high-bg` | `#DCFCE7` | — | Fondo de la insignia "Alto" |
| `--confidence-high-fg` | `#14532D` | — | Texto de la insignia "Alto" |
| `--confidence-mid-bg` | `#FEF9C3` | — | Fondo de la insignia "Medio" |
| `--confidence-mid-fg` | `#713F12` | — | Texto de la insignia "Medio" |
| `--confidence-low-bg` | `#FEE2E2` | — | Fondo de la insignia "Revisar" |
| `--confidence-low-fg` | `#7F1D1D` | — | Texto de la insignia "Revisar" |

**Contraste — WCAG 2.2 AA.** Cada par de arriba cumple 4.5:1 para texto de cuerpo y 3:1 para texto
grande y limites de componentes de UI. Los tres pares mas riesgosos, medidos:

| Par | Ratio | Veredicto |
|---|---|---|
| `#0F172A` sobre `#F8FAFC` (cuerpo sobre fondo) | **17.26:1** | pasa con holgura |
| `#475569` sobre `#FFFFFF` (secundario sobre tarjeta) | **7.57:1** | pasa |
| `#FFFFFF` sobre `#5B21B6` (texto en boton primario) | **8.98:1** | pasa |

Dos correcciones hechas **aqui**, no dejadas para despues:

1. **`#CA8A04` da 2.94:1 sobre blanco.** No alcanza ni para texto (4.5:1) ni para limites de UI
   (3:1). Se conserva como token de marca pero **solo como relleno decorativo detras de texto
   oscuro**. El amarillo accesible para bordes y texto es `#A16207` (**4.92:1**). Un builder que use
   `--warning` para un borde esta violando esta seccion.
2. **`#E2E8F0` da 1.23:1 sobre blanco.** Sirve como divisor no esencial, que WCAG exime, pero **no**
   como contorno de input. Los controles usan `--border-control` `#64748B` (**4.76:1**).

Las insignias del semaforo se miden como texto oscuro sobre relleno claro, y las tres pasan: Alto
`#14532D` sobre `#DCFCE7` = **8.23:1**; Medio `#713F12` sobre `#FEF9C3` = **8.01:1**; Revisar
`#7F1D1D` sobre `#FEE2E2` = **8.20:1**. Sus bordes cumplen el 3:1 de limite de componente: `#16A34A`
= 3.30:1, `#A16207` = 4.92:1, `#DC2626` = 4.83:1. El anillo de foco `#4C1D95` da **10.96:1**.

**El nivel de confianza nunca se comunica solo con color.** Cada insignia lleva la palabra "Alto",
"Medio" o "Revisar" en texto. Es requisito de accesibilidad y, mas importante, la asesora esta
leyendo de reojo.

### Tipografia

| Rol | Familia | Tamano / interlineado | Peso | Tracking |
|---|---|---|---|---|
| Display | Inter | 40px / 1.15 | 600 | -0.02em |
| Heading | Inter | 32 / 24 / 20px · 1.25 | 600 | -0.01em |
| Body | Inter | 16px / 1.5 | 400 | 0 |
| Body large (Copilot) | Inter | 20px / 1.55 | 400 | 0 |
| Small | Inter | 14px / 1.45 | 400 | 0 |
| Caption | Inter | 12px / 1.4 | 500 | 0.01em |
| Mono | ui-monospace, SFMono-Regular, Menlo, monospace | 14px / 1.5 | 400 | 0 |

**El texto de la respuesta del Copilot usa Body large (20px).** No es preferencia estetica: la asesora
lo lee mientras esta en camara, y es la mitigacion tipografica del riesgo #1.

**Carga de la fuente:** Inter via `next/font/google`, autohospedada por Next en el build, subset
`latin`, `display: "swap"` en el call site del loader. Stack de respaldo:
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Nota del track ya
mencionada en §6: `next/font` emite dos `@font-face` de respaldo sin `font-display` y no hay opcion
que lo cambie, asi que ningun criterio de aceptacion lo exige.

Numeros tabulares (`font-variant-numeric: tabular-nums`) en tablas, KPIs y en la duracion estimada.

### Espaciado, radio, elevacion

- **Escala de espaciado:** base 4px. Rampa completa: 4, 8, 12, 16, 24, 32, 48, 64. Sin valores
  arbitrarios.
- **Radio:** `--radius: 0.75rem` (12px) en tarjetas, inputs, botones y paneles. Completo (`9999px`)
  en avatares e insignias.
- **Sombras:** **ninguna.** La interfaz es plana y separa por borde. Es una decision de densidad: una
  herramienta que se usa todo el dia gana mas con jerarquia clara que con profundidad simulada. El
  unico caso con sombra es el popover, `0 4px 12px rgb(15 23 42 / 0.08)`, porque flota de verdad.
- **Ancho maximo de contenido:** 1280px. El Copilot es la excepcion: dos columnas a ancho completo,
  porque la columna de salida quiere todo el espacio disponible.
- **Breakpoints:** 640 / 768 / 1024 / 1280.

### Movimiento

| Clase de interaccion | Duracion | Easing |
|---|---|---|
| Hover y foco | 100ms | `ease-out` |
| Aparicion de panel o insignia | 120ms | `ease-out` |
| Apertura de popover / dialogo | 150ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Streaming de la respuesta | sin animacion | el texto aparece, no se desliza |

Solo `transform` y `opacity`. **Todo respeta `prefers-reduced-motion: reduce`**, donde las duraciones
pasan a `0ms` y las transiciones se desactivan. El streaming deliberadamente no se anima: cualquier
movimiento en el texto que la asesora esta leyendo en voz alta es un costo, no un adorno.

### Estilo de componente

Superficies blancas sobre fondo gris muy claro, separadas por un borde fino de 1px y esquinas de
12px, sin sombra. El morado profundo aparece con moderacion: botones primarios, estado activo de
navegacion y anillo de foco; nunca como fondo de area grande. Densidad alta — el padding interno de
una tarjeta es 16px, no 32px — y tipografia de 16px salvo la respuesta del Copilot, que sube a 20px.

La prueba para saber si un componente nuevo pertenece: **¿la asesora lo puede entender de reojo, en
menos de un segundo, mientras habla a camara?** Si necesita explorarlo, no pertenece a esta interfaz.
No se analizo ninguna referencia externa; el sistema viene de la seccion 11 del documento del cliente.

---

## 8. Autenticacion y autorizacion

### Proveedor y por que

**Supabase Auth.** La sesion ya queda en el contexto de las politicas de RLS de la misma base, que es
la integracion mas estrecha disponible y la razon por la que se acepta la gravedad de la plataforma.
Un solo proveedor de identidad: **no se agrega better-auth ni Clerk** — dos proveedores sobre la misma
base es exactamente la combinacion que `knowledge/stack-compatibility.md` marca como mala.

Metodo: **email + contrasena**. Se eligio sobre magic link por dos razones concretas: es determinista
en local (un magic link exige leer Inbucket, lo que convierte cada prueba de sesion en una tuberia de
correo) y las asesoras entran desde el mismo computador todos los dias, donde una contrasena guardada
en el gestor es mas rapida que abrir el correo.

### Flujos

**No existe registro publico.** No hay ruta que cree una cuenta desde una peticion no autenticada, y
`enable_signup = false` esta puesto en `supabase/config.toml` **y** debe ponerse en el proyecto
hospedado. Son dos lugares porque son dos entornos, y el segundo se verifica en la lista de
lanzamiento de §20.1.

- **Alta (invitacion):** un admin, desde `/app/settings`, crea la cuenta con la secret key
  (`createUser` con contrasena temporal y `email_confirm: true`) y en la **misma transaccion logica**
  inserta la fila en `advisors` con el mismo `id`. Le entrega la contrasena temporal por fuera del
  sistema. Rama de fallo: si el insert en `advisors` falla, el usuario de Auth se borra — no se deja
  un usuario que puede ingresar y no tiene perfil.
- **Ingreso:** `/login` → Server Action → `signInWithPassword` → cookie de sesion → redireccion a
  `/app`. Fallo: mismo mensaje generico (`"Correo o contrasena incorrectos"`) para credenciales malas
  y para usuario inexistente, para no filtrar que correos existen.
- **Asesora inactiva:** las credenciales son correctas pero `advisors.status = 'inactiva'`. La accion
  cierra la sesion inmediatamente y responde `FORBIDDEN` con `"Tu cuenta esta desactivada."` La
  verificacion vive en el servidor, no en la UI.
- **Cambio de contrasena:** `updateUser` desde `/app/settings`, con la sesion vigente. No hay flujo de
  "olvide mi contrasena" en v1: con diez usuarias, un admin resetea la contrasena. Es un non-goal
  implicito y esta dicho aqui para que nadie lo construya.
- **Expiracion de sesion:** `jwt_expiry` de 3600 s con refresh automatico del cliente de Supabase.
  Cuando el refresh falla, `proxy.ts` redirige a `/login?next=<ruta>`.
- **Salida:** `signOut` en el servidor, cookie borrada, redireccion a `/login`.
- **Desactivacion de cuenta:** un admin pone `status = 'inactiva'`. La siguiente peticion de esa
  asesora falla en el chequeo del servidor. **No se borran cuentas:** sus sesiones de entrenamiento,
  intercambios y grabaciones referencian la fila, y borrar destruiria la historia que este producto
  existe para acumular.

### Proteccion de rutas

| Superficie | Regla | Donde se aplica |
|---|---|---|
| `/health` | publica | `src/app/health/route.ts` — no toca la sesion |
| `/login` | publica; si ya hay sesion, redirige a `/app` | `src/app/login/page.tsx` |
| todo lo demas | autenticada | `proxy.ts` — matcher que excluye `/login`, `/health`, `/api/transcription-callback`, `/api/cron/*` y los assets |
| `/app/knowledge/[id]` (escritura) | `role = admin` | `src/server/products.ts`, dentro de cada accion |
| `/app/settings` (escritura) | `role = admin` | `src/server/commercial-rules.ts` y `src/server/advisors.ts` |
| `/api/transcription-callback` | secreto compartido + token por grabacion | el propio route handler |
| `/api/cron/retention` | `Authorization: Bearer $CRON_SECRET` | el propio route handler |

**Regla de aplicacion: la autorizacion se verifica en el servidor en cada peticion.** Los guardas de
ruta del cliente son cosmeticos y nunca la unica verificacion. **Un boton escondido no es un
permiso.**

Y una trampa especifica de este framework que este blueprint no puede ignorar: **las Server Functions
son POSTs a la ruta que las usa**, asi que un matcher de `proxy.ts` que excluye un path se salta la
autenticacion de sus Server Functions en silencio. Por eso **cada Server Action llama `requireRole()`
por su cuenta**, ademas de lo que haga el proxy. El proxy es conveniencia de redireccion; la
autorizacion vive en la accion.

Nota del track que aplica aqui: **`middleware.ts` ya no existe** — el archivo es `proxy.ts` y la
funcion exportada es `proxy`, no `middleware`. El proxy corre en el runtime de Node por defecto, y
poner `runtime` como config de segmento dentro de un archivo de proxy lanza error.

### Roles y permisos

| Rol | Puede | No puede |
|---|---|---|
| `asesor` | Leer todas las fichas de producto y reglas comerciales; crear y ver **sus** sesiones de entrenamiento, respuestas, sesiones de live e intercambios; subir y ver **sus** grabaciones; promover un insight de **sus** grabaciones a pregunta de entrenamiento; ver el dashboard con sus propias metricas | Crear, editar o borrar fichas de producto; cambiar reglas comerciales; crear, editar o desactivar cuentas; ver sesiones, respuestas o grabaciones de otra asesora; ver el costo agregado de la organizacion |
| `admin` | Todo lo del rol `asesor`, mas: CRUD completo del Knowledge Hub; editar y activar/desactivar reglas comerciales; crear, editar y desactivar cuentas; ver todas las sesiones y grabaciones; ver el costo agregado y las metricas de `llm_calls` | Borrar una cuenta (solo desactivar); editar a mano una migracion o el esquema desde el dashboard de Supabase |

### Sesiones

- **Tipo de token:** JWT de Supabase mas un refresh token.
- **Almacenamiento:** cookies gestionadas por `@supabase/ssr`, leidas y escritas en el servidor. El
  token de acceso **no** se guarda en `localStorage`.
- **Vida:** `jwt_expiry` 3600 s; el refresh token rota en cada uso.
- **Flags de cookie:** `HttpOnly`, `SameSite=Lax`, y `Secure` en produccion (en `http://127.0.0.1`
  local, `Secure` haria que el navegador la descarte). `Path=/`.
- **CSRF:** `SameSite=Lax` cubre el vector clasico de formulario cross-site, y Next verifica el
  header `Origin` de las Server Actions contra el host, rechazando la peticion cuando no coinciden.
  Los dos route handlers que aceptan POST desde fuera no usan cookies en absoluto: se autentican con
  secreto compartido, que es inmune a CSRF por construccion.

### Aislamiento por fila

Este proyecto tiene un solo tenant — una empresa, un equipo — asi que no hay multi-tenancy. Lo que si
hay es **aislamiento por asesora**, y se aplica con **dos mecanismos, los dos siempre**:

1. **Politicas de RLS en Postgres.** `alter table ... enable row level security` en las seis tablas
   privadas (`training_sessions`, `training_answers`, `live_sessions`, `copilot_exchanges`,
   `live_recordings`, `insights`), con politicas que comparan `advisor_id` contra `auth.uid()`.
   `products` y `commercial_rules` llevan RLS con lectura para cualquier rol autenticado y escritura
   solo para `admin`. Las politicas se nombran `<tabla>_<rol>_<accion>` para que `pg_policies` sea
   legible, y se escriben en una migracion creada con `pnpm db:generate:custom`.
2. **Alcance obligatorio en la capa de datos.** El servidor conecta a Postgres como superusuario a
   traves del driver `postgres`, lo que **salta RLS**. Decir lo contrario seria el error mas caro de
   esta seccion. Por eso cada consulta sobre datos privados filtra por `advisor_id` explicitamente y
   cada mutacion llama `requireRole()` antes del trabajo.

Dicho sin rodeos: **RLS protege la superficie de la API de Supabase; el filtrado explicito protege la
superficie de nuestro servidor.** Ninguno de los dos es suficiente solo, y "acuerdense de filtrar por
`advisor_id`" no es un mecanismo — lo que lo convierte en mecanismo es que las consultas privadas
pasan por funciones en `src/server/` que reciben el `advisor_id` del wrapper `getSession()` —
respaldado por `auth.getClaims()` — como parametro obligatorio, no de un argumento opcional que se
pueda olvidar.

La verificacion es de dos niveles, en dos pasos distintos: el paso 3 afirma la propiedad estructural
(RLS habilitado y las politicas nombradas presentes en `pg_policies`), y el paso 5 afirma la
propiedad de comportamiento (un cliente de Supabase autenticado como asesora recibe error al
escribir en `products`).


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
rg -n '120000|envio gratis' src --glob '!src/server/commercial-rules.ts' --glob '!src/app/**'; test $? -eq 1 # pasa: no hay umbral comercial incrustado en logica consumidora
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
rg -n 'output_format|budget_tokens|assistant.*prefill' src/lib/ai src/server; test $? -eq 1 # pasa: no aparecen parametros incompatibles o deprecados
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
pnpm exec next start --port 3102 & SRV=$!; for i in $(seq 1 30); do curl -sf http://127.0.0.1:3102/health >/dev/null && break; sleep 1; done; curl -sf http://127.0.0.1:3102/health | grep -q '"ok":true'; RC=$?; kill $SRV; exit $RC # pasa: el artefacto compilado arranca y responde /health, no solo compila
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
#!/usr/bin/env bash
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

if [ ! -f package.json ] || [ ! -f src/app/layout.tsx ] || [ ! -f src/app/page.tsx ] || [ ! -f src/app/globals.css ]; then
  scaffold_dir="$(mktemp -d)"
  trap 'rm -rf "$scaffold_dir"' EXIT
  pnpm create next-app@16.3.1 "$scaffold_dir/app" --ts --tailwind --biome --app --src-dir --import-alias '@/*' --use-pnpm --yes
  cp "$scaffold_dir/app/package.json" package.json
  cp "$scaffold_dir/app/postcss.config.mjs" postcss.config.mjs
  mkdir -p src/app
  test -f src/app/layout.tsx || cp "$scaffold_dir/app/src/app/layout.tsx" src/app/layout.tsx
  test -f src/app/page.tsx || cp "$scaffold_dir/app/src/app/page.tsx" src/app/page.tsx
  test -f src/app/globals.css || cp "$scaffold_dir/app/src/app/globals.css" src/app/globals.css
fi

node <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

packageJson.packageManager = "pnpm@11.22.0";
packageJson.engines = { ...packageJson.engines, node: ">=24.19.0 <25" };
packageJson.scripts = {
  ...packageJson.scripts,
  dev: "next dev",
  build: "next build",
  typecheck: "tsc --noEmit",
  lint: "biome check .",
  format: "biome check --write .",
  test: "vitest run",
  "test:e2e": "playwright test",
  "db:up": "docker compose up -d --wait",
  "db:down": "docker compose down",
  "db:reset": "docker compose down -v && docker compose up -d --wait",
  "db:generate": "drizzle-kit generate",
  "db:generate:custom": "drizzle-kit generate --custom",
  "db:migrate": "drizzle-kit migrate",
  "db:migrate:test": "DRIZZLE_TARGET=test drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx scripts/seed.ts",
  "env:local": "tsx scripts/write-env-local.ts",
  "env:local:supabase": "supabase status -o env > .supabase-status.env && tsx scripts/write-env-local.ts --from-supabase",
  "supabase:check": "bash scripts/check-supabase-cli.sh",
  "supabase:start": "pnpm supabase:check && supabase start",
  "supabase:stop": "supabase stop",
};

fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
NODE

pnpm add --save-exact next@16.3.1 react@19.2.8 react-dom@19.2.8 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 drizzle-orm@0.45.2 postgres@3.4.9 @supabase/supabase-js@2.112.3 @supabase/ssr@0.12.4 @anthropic-ai/sdk@0.117.1 zod@4.4.3 react-hook-form@7.85.0 @hookform/resolvers@5.9.1 @tanstack/react-query@5.101.4
pnpm add --save-dev --save-exact typescript@6.0.3 @types/node@24.13.3 @types/react@19.2.18 @types/react-dom@19.2.4 @biomejs/biome@2.5.9 drizzle-kit@0.31.10 vitest@4.1.11 @playwright/test@1.62.1 tsx@4.23.12
node <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const pinned = {
  dependencies: {
    "@anthropic-ai/sdk": "0.117.1",
    "@hookform/resolvers": "5.9.1",
    "@supabase/ssr": "0.12.4",
    "@supabase/supabase-js": "2.112.3",
    "@tanstack/react-query": "5.101.4",
    "@tailwindcss/postcss": "4.3.3",
    "drizzle-orm": "0.45.2",
    next: "16.3.1",
    postgres: "3.4.9",
    react: "19.2.8",
    "react-dom": "19.2.8",
    "react-hook-form": "7.85.0",
    tailwindcss: "4.3.3",
    zod: "4.4.3",
  },
  devDependencies: {
    "@biomejs/biome": "2.5.9",
    "@playwright/test": "1.62.1",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "drizzle-kit": "0.31.10",
    tsx: "4.23.12",
    typescript: "6.0.3",
    vitest: "4.1.11",
  },
};

packageJson.dependencies = { ...packageJson.dependencies, ...pinned.dependencies };
packageJson.devDependencies = { ...packageJson.devDependencies, ...pinned.devDependencies };
for (const name of Object.keys(pinned.dependencies)) delete packageJson.devDependencies[name];
for (const name of Object.keys(pinned.devDependencies)) delete packageJson.dependencies[name];
fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
pnpm install --lockfile-only
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
| `VERCEL_GIT_COMMIT_SHA` | servidor | ninguno | la inyecta la plataforma en el build; opcional en `env.ts`, `"unknown"` en local |

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
pnpm exec next start --port 3102 & SRV=$!; for i in $(seq 1 30); do curl -sf http://127.0.0.1:3102/health >/dev/null && break; sleep 1; done; curl -sf http://127.0.0.1:3102/health | grep -q '"ok":true'; RC=$?; kill $SRV; exit $RC # pasa: el artefacto compilado arranca y responde
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
