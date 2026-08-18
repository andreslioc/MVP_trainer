---
description: Convenciones de esquema, migraciones, RLS y semillas
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
  - "scripts/seed.ts"
---

# Base de datos

- **Drizzle es el unico dueno del esquema.** `src/db/schema.ts` es la fuente de verdad. El editor de
  esquema del dashboard de Supabase es de solo lectura desde el dia uno.
- Toda tabla lleva `id uuid primary key default gen_random_uuid()` y `created_at timestamptz not null
  default now()`.
- **Nunca se edita a mano una migracion que ya corrio, ni una generada por `pnpm db:generate`.** La
  unica excepcion son las creadas con `pnpm db:generate:custom`, que nacen vacias precisamente para
  escribir SQL a mano (RLS, indices parciales, triggers). Esa excepcion es explicita y no se
  extiende a las demas.
- **Nunca se escribe el nombre de un archivo de migracion.** Los nombra drizzle-kit con un sufijo
  aleatorio. Se habla de "la migracion que emite `pnpm db:generate`" y se verifica el efecto en la
  base, no el nombre del archivo.
- `advisors.id` **iguala** el id del usuario de Supabase Auth, pero **sin llave foranea a
  `auth.users`**: una FK al esquema `auth` acopla las migraciones a la plataforma y las vuelve
  inaplicables sobre un Postgres puro, que es exactamente donde corren las pruebas. El unico escritor
  de `advisors` es `src/server/advisors.ts` y ahi se garantiza la igualdad.
- **La app usa `DATABASE_URL` (pooler). Migraciones y scripts usan `DIRECT_DATABASE_URL`.** Un pooler
  en modo transaccion pierde advisory locks y prepared statements.
- **Las pruebas usan `TEST_DATABASE_URL`** — el Postgres de `docker-compose.yml`. Nunca comparten
  base con desarrollo. `tests/setup.ts` fuerza esto reescribiendo `DATABASE_URL` en el proceso de
  pruebas.
- **RLS es defensa en profundidad, no la unica defensa.** Las politicas protegen la API de Supabase;
  el servidor conecta como superusuario y por eso ademas filtra por `advisor_id` en cada consulta y
  llama `requireRole()` en cada mutacion. Ambas cosas, siempre.
- Las politicas de RLS viven en una migracion `--custom` y se nombran
  `<tabla>_<rol>_<accion>` para que `pg_policies` sea legible.
- `products` y `commercial_rules`: lectura para todos los roles, escritura solo `admin`. Todo lo
  demas (`training_*`, `live_*`, `copilot_exchanges`, `insights`, `live_recordings`) es privado del
  asesor dueno de la fila.
- Las semillas son **idempotentes**: `on conflict do nothing` o un upsert por clave natural.
  `pnpm db:seed` se corre dos veces seguidas sin duplicar nada.
- `llm_calls` se escribe con el uso **reportado por el proveedor**. Nunca se estima contando
  caracteres.
- `live_recordings.expires_at` y `insights` heredan las mismas obligaciones de retencion que la base
  primaria: las transcripciones contienen PII de clientes.
