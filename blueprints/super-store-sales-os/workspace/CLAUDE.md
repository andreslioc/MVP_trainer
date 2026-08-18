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
SDK) → `src/server/llm-calls.ts` persiste el uso → `src/db/client.ts` → Postgres.

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
8. **`stop_reason` se revisa antes de leer `content`.** Siempre. Un refusal llega con HTTP 200.
9. **El uso de tokens se persiste desde lo que reporta el proveedor**, nunca contando caracteres.

## Sistema de diseno

Tokens definidos una sola vez en el bloque `@theme` de `src/app/globals.css`.

| Rol | Valor | Se usa para |
|---|---|---|
| Primario | `#5B21B6` | Botones primarios, enlaces, estados activos |
| Primario profundo | `#4C1D95` | Encabezados, estado activo, anillo de foco |
| Azul de soporte | `#1E3A8A` | Acentos informativos, graficas |
| Fondo | `#F8FAFC` | Fondo de pagina |
| Superficie | `#FFFFFF` | Tarjetas, paneles, popovers |
| Borde decorativo | `#E2E8F0` | Divisores (no esenciales) |
| Borde de control | `#64748B` | Contorno de inputs y controles — 4.76:1 |
| Texto | `#0F172A` | Cuerpo — 17.26:1 sobre el fondo |
| Texto secundario | `#475569` | Leyendas — 7.57:1 sobre superficie |
| Confianza Alto | fondo `#DCFCE7` · texto `#14532D` · borde `#16A34A` | Semaforo de evidencia |
| Confianza Medio | fondo `#FEF9C3` · texto `#713F12` · borde `#A16207` | Semaforo de evidencia |
| Confianza Revisar | fondo `#FEE2E2` · texto `#7F1D1D` · borde `#DC2626` | Semaforo de evidencia |

- **Tipografia:** Inter via `next/font`. Titulos 600; cuerpo 400 16px/1.5; numeros tabulares en
  tablas.
- **Escala:** 12 / 14 / 16 / 20 / 24 / 32 / 40 px.
- **Espaciado:** base 4px — 4, 8, 12, 16, 24, 32, 48, 64. Sin valores arbitrarios.
- **Radio:** 12px (`--radius: 0.75rem`) en tarjetas, inputs y botones; completo en avatares.
- **Elevacion:** plano. Solo bordes. Densidad y velocidad por encima de animacion.
- **Movimiento:** 120ms `ease-out`, solo `transform` y `opacity`. Respeta `prefers-reduced-motion`.
- **Layout:** ancho maximo 1280px; breakpoints 640 / 768 / 1024 / 1280.
- **`#CA8A04` no se usa para texto ni para bordes** (2.94:1 sobre blanco). Solo como relleno
  decorativo detras de texto oscuro. El borde amarillo accesible es `#A16207`.

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
| `.claude/rules/testing.md` | `tests/**`, `vitest.config.ts`, `playwright.config.ts` |

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
