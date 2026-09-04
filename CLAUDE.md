# Super Store Sales OS

Herramienta interna de capacitacion y asistencia comercial para las asesoras de Super Store, una
tienda de suplementos que vende por TikTok Live en Colombia. Tres modulos sobre una sola fuente de
verdad: Training Simulator (antes del live), Live Copilot (durante) y Live Intelligence (despues).

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm dev` — http://localhost:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Pruebas | `pnpm test` · un archivo: `pnpm test tests/unit/nav.test.ts` |
| E2E | `pnpm test:e2e` |
| Base de pruebas arriba / abajo | `pnpm db:up` · `pnpm db:down` |
| Base de pruebas desde cero | `pnpm db:reset` |
| Generar migracion | `pnpm db:generate` · vacia para SQL a mano: `pnpm db:generate:custom` |
| Aplicar migracion (dev) | `pnpm db:migrate` |
| Aplicar migracion (pruebas) | `pnpm db:migrate:test` |
| Inspeccionar base | `pnpm db:studio` |
| Semillas | `pnpm db:seed` |
| Escribir .env.local | `pnpm env:local` · con llaves de Supabase: `pnpm env:local:supabase` |
| Version del CLI de Supabase | `pnpm supabase:check` |
| Stack de Supabase | `pnpm supabase:start` · `pnpm supabase:stop` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

La version de Node esta fijada en `.nvmrc`. Las versiones de dependencias viven en el lockfile —
leelo, nunca adivines una.

<!-- Pasos 1 y 2 solo necesitan `pnpm db:up`. `pnpm supabase:start` se requiere desde el paso 3. -->

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Drizzle ORM · Postgres
(Supabase) · Supabase Auth · Supabase Storage · Gemini REST · Vercel. Gestor: `pnpm`.

## Arquitectura

**Camino de una peticion.** navegador → `src/app/(app)/app/copilot/page.tsx` (Server Component) →
accion en `src/server/copilot/compose.ts` → `src/lib/ai/gateway.ts` (unico archivo que importa el
REST, sin SDK) → `src/server/llm-calls.ts` persiste el uso → `src/db/client.ts` → Postgres.

**Fronteras.** Cruzar una al reves rompe el build:

| Capa | Puede importar de | Jamas |
|---|---|---|
| `src/app/**` | `components`, `server`, `lib` | `src/db/` directo |
| `src/components/**` | `lib`, otros componentes | `server/` o `db/` |
| `src/server/**` | `db`, `lib` | React o `components/` |
| `src/db/**` | nada interno | `server/` |
| todo excepto `src/lib/ai/gateway.ts` | — | llamar al proveedor de IA |

**Donde vive cada cosa.**

| Asunto | Unica fuente de verdad |
|---|---|
| Esquema de base | `src/db/schema.ts` — se cambia aqui, luego `pnpm db:generate` |
| Entorno | `src/lib/env.ts` — nunca `process.env` en otro archivo |
| Carga de `.env` fuera de Next | `src/lib/load-env.ts` — lo importan drizzle.config, tests/setup y los scripts |
| Tokens de diseno | `src/app/globals.css`, bloque `@theme` — sin hex ni px sueltos en componentes |
| Sesion | `src/lib/auth.ts` — un `getSession()` de dominio respaldado por `auth.getClaims()`, y un solo `requireRole()` |
| Acoplamiento al proveedor de IA | `src/lib/ai/gateway.ts` — un solo lugar en todo el repo |
| Ids de modelo y precios | `src/lib/ai/config.ts`, leidos de env — nunca en un call site |
| Reglas comerciales | tabla `commercial_rules` — configurables, nunca hardcodeadas |

## Reglas de codigo

1. **Un componente por archivo. Maximo 300 lineas.** Mas que eso se divide por responsabilidad.
2. **Especificadores relativos con extension `.ts` / `.tsx`.** `import { x } from "../lib/x.ts"`.
   Funciona en Next, en vitest, en `tsx` y en `tsc` con `allowImportingTsExtensions` y
   `rewriteRelativeImportExtensions`. El alias `@/` existe por el scaffold y **no se usa**: `tsx`
   resuelve especificadores literalmente y una convencion partida rompe los scripts.
3. **Server-first.** Todo es Server Component hasta que necesite estado o un handler. `"use client"`
   va en la hoja mas pequena, nunca en un layout ni en una page.
4. **Sin barrel files.** Se importa del modulo fuente.
5. **Validar en el borde.** Cada route handler y cada server action parsea su entrada con un esquema
   de Zod antes de tocar logica de negocio.
6. **Los errores retornan resultados tipados**, no strings lanzados:
   `{ ok: true, data } | { ok: false, error: { code, message, field? } }`.
7. **Ningun modulo inventa informacion fuera del Knowledge Hub.** Si el dato no esta en `products`
   ni en `commercial_rules`, la respuesta lo dice; no lo rellena.
8. **`finishReason` se revisa antes de leer el texto.** Siempre. Un bloqueo llega con HTTP 200.
9. **El uso de tokens se persiste desde lo que reporta el proveedor**, nunca contando caracteres.

## Sistema de diseno

Marca **Galleon 7**. Tokens definidos una sola vez en el bloque `@theme` de `src/app/globals.css`.
El logo vive en `public/galleon-imagotipo.png` (version principal, fondo claro) y
`public/galleon-isotipo.png` (el escudo solo, para espacios estrechos).

| Rol | Valor | Se usa para |
|---|---|---|
| Primario — Azul base | `#0A5589` | Botones secundarios, enlaces, encabezados — 7.20:1 |
| Primario profundo — Azul muy oscuro | `#022F40` | Estado activo, anillo de foco, panel de marca — 12.99:1 |
| Azul de soporte — Azul petroleo | `#0C7492` | Acentos informativos, graficas — 4.90:1 |
| Acento — Naranja | `#E6861C` | **Solo relleno.** Boton de accion, con `--accent-fg` encima |
| Tinta del acento | `#96540C` | El naranja cuando toca escribir o bordear — 5.40:1 |
| Menta | `#2EC4B6` | **Solo relleno.** Realces amables |
| Tinta de la menta | `#116E67` | La menta cuando toca escribir o bordear — 5.58:1 |
| Fondo | `#F5F5F5` | Fondo de pagina |
| Superficie | `#FFFFFF` | Tarjetas, paneles, popovers |
| Borde decorativo | `#D9E0E3` | Divisores (no esenciales) |
| Borde de control | `#5F7078` | Contorno de inputs y controles — 4.73:1 |
| Texto | `#1C1C1C` | Cuerpo — 15.63:1 sobre el fondo |
| Texto secundario | `#5F7078` | Leyendas — 4.73:1 sobre el fondo |
| Confianza Alto | fondo `#DCFCE7` · texto `#14532D` · borde `#16A34A` | Semaforo de evidencia |
| Confianza Medio | fondo `#FEF9C3` · texto `#713F12` · borde `#A16207` | Semaforo de evidencia |
| Confianza Revisar | fondo `#FEE2E2` · texto `#7F1D1D` · borde `#DC2626` | Semaforo de evidencia |

- **Tipografia:** dos familias del manual, via `next/font`. **Roboto** para cuerpo e interfaz
  (`--font-sans`) y **Metropolis** para titulares (`--font-display`, clase `font-display`).
  Metropolis no esta en Google Fonts: hasta tener la licenciada se sirve **Jost**, y el token la
  nombra primero para que entre sola el dia que se cargue. Titulos 500; cuerpo 400 16px/1.5;
  numeros tabulares en tablas.
- **Escala:** 12 / 14 / 16 / 20 / 24 / 32 / 40 px.
- **Espaciado:** base 4px — 4, 8, 12, 16, 24, 32, 48, 64. Sin valores arbitrarios.
- **Radio:** 6px (`--radius: 0.375rem`) en tarjetas, inputs y botones; completo en avatares. El
  escudo del isotipo es anguloso y una esquina blanda pelea con el.
- **Elevacion:** plano. Solo bordes. Densidad y velocidad por encima de animacion.
- **Movimiento:** 120ms `ease-out`, solo `transform` y `opacity`. Respeta `prefers-reduced-motion`.
- **Layout:** ancho maximo 1280px; breakpoints 640 / 768 / 1024 / 1280.
- **El naranja y la menta de la marca NO se usan para texto ni para bordes** (2.47:1 y 1.99:1
  sobre el fondo). Son relleno, con `#1C1C1C` encima (6.32:1 y 7.86:1). Para escribir con ellos
  estan `--accent-ink` y `--mint-ink`. Es la misma regla que ya regia para `#CA8A04`.
- **`#CA8A04` no se usa para texto ni para bordes** (2.94:1 sobre blanco). Solo como relleno
  decorativo detras de texto oscuro. El borde amarillo accesible es `#A16207`.

### Tema claro y oscuro

Dos paletas, un solo vocabulario de tokens. El tema claro es el del manual; el oscuro se levanta
sobre el **mismo `#022f40`** del panel del login, asi que no es una paleta prestada: es el lado
oscuro del manual.

- **Como se elige.** Cookie `tema` con tres estados: `sistema` (por defecto), `claro`, `oscuro`. El
  servidor la lee en `src/app/layout.tsx` y estampa `data-theme` en `<html>` **antes de pintar** —
  por eso no hay destello de claro al recargar. `sistema` no estampa nada y manda
  `prefers-color-scheme`. El interruptor vive en la barra de sesion.
- **Donde viven los valores.** `@theme` solo MAPEA (`--color-x: var(--x)`); los hex estan en `:root`
  y el bloque oscuro los reescribe. El bloque oscuro aparece **dos veces** —el selector de
  `@media (prefers-color-scheme: dark)` y el de `[data-theme="dark"]`— porque CSS no permite
  fusionarlos. Que no se desvien lo afirma `tests/unit/design-tokens.test.ts`.
- **Dos tokens invierten su papel.** `--primary-deep` pasa de ser el paso mas oscuro al mas claro, y
  `--primary-fg` —la tinta que va encima— de blanco a azul profundo. Todo `bg-primary-deep` del repo
  va con `text-primary-fg`, asi que el par se invierte entero sin tocar una clase.
- **Cuatro superficies NO siguen al tema**, y son los unicos hex literales que se permiten dentro de
  `@theme`. Una prueba rechaza la quinta.

  | Token | Por que es fija |
  |---|---|
  | `--color-brand-panel*` | El panel del login lleva el isotipo blanco encima |
  | `--color-photo*` | Las fotos del catalogo vienen con **fondo blanco opaco** (verificado contra R2): sobre placa oscura cada producto quedaria en un recuadro blanco |
  | `--color-stage*` | El escenario del simulacro imita una pantalla de celular en vivo |
  | `--color-scrim` | El velo de un dialogo tiene que oscurecer, no aclarar |

- **El logo es un ARCHIVO distinto por tema, no un color.** `BrandLogo`
  (`src/components/layout/brand-logo.tsx`) pinta las dos versiones y oculta una con CSS, sin
  JavaScript. Para eso existe el `@custom-variant dark` de `globals.css`, que repite los tres estados
  del tema — el `dark:` de Tailwind solo mira `prefers-color-scheme` e ignoraria la eleccion
  explicita.
- **Nunca `text-white` sobre un relleno de token.** La tinta de un relleno es su propio token
  (`--primary-fg`, `--accent-fg`): en oscuro el relleno se aclara y el blanco queda en 1.92:1.

| Rol | Claro | Oscuro | Medido en oscuro |
|---|---|---|---|
| Fondo | `#f5f5f5` | `#022f40` | — |
| Superficie | `#ffffff` | `#073e52` | — |
| Texto | `#1c1c1c` | `#f4f7f8` | 10.72:1 sobre superficie |
| Texto secundario | `#5f7078` | `#a7bcc5` | 5.85:1 |
| Primario / enlaces | `#0a5589` | `#7cc4e8` | 6.00:1 |
| Paso fuerte | `#022f40` | `#a8d8ef` | 7.55:1 como texto |
| Tinta del relleno primario | `#ffffff` | `#022f40` | 7.36:1 sobre el relleno |
| Borde de control | `#5f7078` | `#8aa5b0` | 4.45:1 |
| Tinta del naranja | `#96540c` | `#f4a94a` | 5.84:1 |
| Tinta de la menta | `#116e67` | `#5fdccf` | 6.94:1 |
| Destructivo | `#dc2626` | `#fb8a8a` | 5.00:1 |

`--success` (`#16a34a`) da 3.30:1 sobre blanco: **solo borde y relleno, nunca texto.** Para escribir
en verde estan `--confidence-high-fg` con su fondo. Una prueba afirma que `text-success` no aparece
en el repo.

### Primitivas de acomodo

Tres componentes en `src/components/ui/`. Antes cada pantalla armaba la tarjeta a mano en 67
archivos y se desvio: `p-4`, `p-5` y `p-6` mezclados en el mismo modulo, y **nueve anchos de pagina
distintos** entre los modulos, asi que al navegar la columna de contenido se corria de lado.

| Primitiva | Decide | Notas |
|---|---|---|
| `Card` / `cardClasses()` | la superficie | Tonos por PAPEL (`superficie`, `tinte`, `alerta`, `atencion`, `logro`), no por color. Densidad `comoda` (p-5), `compacta` (p-4) o `sin`. `cardClasses()` viste un `<Link>`, `<li>` o `<details>` sin dejar de ser el elemento correcto |
| `CardGrid` | donde se acomodan | Una escalera para toda la app: **siempre arranca en una columna** (a 320px dos columnas dejan tarjetas de 140px), `sm:2`, y `lg:3` o `lg:4`. Cuatro pasa por dos y no por tres, que dejaria una fila huerfana. `gap-4` fijo |
| `PageSection` | cuanto ancho ocupa | Tres anchos con nombre: `lectura` (max-w-3xl), `panel` (max-w-5xl, por defecto), `completo` (sin tope propio; manda el armazon). Garantiza un solo `h1` atado a `aria-labelledby` |

Aplicadas en las pantallas del dia a dia —Inicio, Pre-training, Training, Copilot, Intelligence— y en
Analiticas. Knowledge, Reglas y Cuentas siguen a mano; la primitiva ya esta lista para ellas.


## Entorno

Cada variable, su proposito y de donde sacarla estan en `.env.example`, la unica plantilla que se
versiona. `.env` y `.env.local` pueden contener valores reales y jamas se versionan.

Precedencia: shell/CI > `.env.local` > `.env`; `.env.example` nunca se carga. `pnpm env:local`
genera `.env.local`, toma `.env` como base y preserva lo que ya escribiste a mano en `.env.local`.

## Reglas por area

Convenciones diferidas — lee el archivo que corresponda antes de editar esa area:

| Archivo | Aplica a |
|---|---|
| `.claude/rules/database.md` | `src/db/**`, `drizzle/**`, `scripts/seed.ts` |
| `.claude/rules/ai-gateway.md` | `src/lib/ai/**`, `src/server/copilot/**`, `src/server/training/**` |
| `.claude/rules/responsible-communication.md` | `src/lib/ai/prompts/**`, `src/server/copilot/**` |
| `.claude/rules/ui.md` | `src/app/**`, `src/components/**`, `src/app/globals.css` |
| `.claude/rules/testing.md` | `tests/**`, `vitest.config.mts`, `playwright.config.ts` |

## No negociable

1. **Drizzle es el unico dueno del esquema.** El editor de esquema del dashboard de Supabase es de
   solo lectura. Dos sistemas de migracion sobre una base es una combinacion conocida-mala.
2. **La app usa el pooler; migraciones y scripts usan la URL directa.** Nunca al revés.
3. **Las migraciones son un paso explicito de despliegue, jamas al arrancar la app.**
4. **Ningun suplemento cura, trata ni previene enfermedades.** Ni un estudio, certificacion,
   porcentaje o aprobacion inventados. Embarazo, lactancia, medicamentos o enfermedad entran por la
   ruta de cautela obligatoria.
5. **La vista por defecto del Copilot es la respuesta Express de 15–20 s.** Es decision de producto,
   no detalle de UI: la asesora esta en camara.
6. Nunca commitear secretos, `.env` ni output de build.
7. Nunca editar a mano una migracion que ya corrio, ni una generada por `pnpm db:generate`. La
   unica excepcion son las creadas con `pnpm db:generate:custom`, que nacen vacias para eso.
8. Nunca marcar una tarea como hecha con un comando del gate fallando.
