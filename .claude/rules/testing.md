---
description: Convenciones de pruebas unitarias, de integracion y E2E
paths:
  - "tests/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Pruebas

## Donde va cada cosa

| Carpeta | Corre contra | Cubre |
|---|---|---|
| `tests/unit/**` | nada externo | logica pura, validadores, orquestador de CTAs, gate de comunicacion responsable |
| `tests/integration/**` | el Postgres de `docker-compose.yml` | server actions y consultas reales |
| `tests/e2e/**` | el dev server de Next | proteccion de rutas y `/health` |
| `tests/fixtures/**` | — | entradas fijas (transcripciones, payloads de callback) |

## Reglas

- **Las pruebas nunca comparten base con desarrollo.** `TEST_DATABASE_URL` apunta al Postgres de
  compose. `tests/setup.ts` reescribe `DATABASE_URL` dentro del proceso de pruebas para que ningun
  import transitivo pueda tocar la base de dev.
- Antes de correr integracion: `pnpm db:up && pnpm db:migrate:test`.
- `fileParallelism: false` a proposito: una sola base compartida, y dos archivos haciendo `TRUNCATE`
  al mismo tiempo se pisan.
- Cada archivo de integracion limpia **solo** las tablas que toca, en `beforeEach`, y nunca depende
  del orden de ejecucion.
- **Sin globals.** Se importa explicito: `import { describe, expect, it } from "vitest";`.
- **Ningun gate llama a la API de Anthropic ni a Deepgram.** El gateway acepta un cliente inyectado y
  las pruebas le pasan uno falso. Un gate que necesita credenciales de un tercero no es un gate.
- **Se afirman propiedades, no conteos.** "existe una fila con `status='transcribed'`" en vez de "hay
  3 filas"; `exit 0, 0 failed, 0 skipped` en vez de "42 passed". Un conteo se rompe en cada edicion.
  La unica excepcion legitima es cuando el conteo **es** el invariante — "exactamente 1 fila despues
  de reenviar el mismo callback".
- Todo comando de verificacion **sale 0 cuando el paso esta correcto**. Si lo correcto es un fallo,
  se envuelve: `cmd; test $? -eq 1`. Un `!` pelado acepta cualquier fallo, incluido "escribi mal el
  comando".
- E2E cubre solo flujos sin sesion. Sembrar una sesion de navegador contra Supabase Auth local es mas
  maquinaria de la que justifica un prototipo de 10 usuarias; esos caminos se cubren con pruebas de
  integracion. Esta decision esta escrita en blueprint.md §12.
