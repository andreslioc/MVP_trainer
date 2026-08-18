---
name: add-migration
description: Usar al agregar, renombrar o borrar una tabla, columna, indice o politica de RLS en Super Store Sales OS. Cubre el flujo completo de Drizzle: editar el esquema, generar la migracion, aplicarla a la base de pruebas y a la de desarrollo, y verificar el efecto en Postgres sin nombrar el archivo generado.
---

# Agregar una migracion

## Cuando usarla

Cualquier cambio de forma en la base: nueva tabla, nueva columna, indice, constraint, enum nuevo, o
una politica de RLS. Tambien cuando `pnpm db:migrate` reporta deriva de esquema.

## Pasos

1. Edita `src/db/schema.ts`. Es la unica fuente de verdad de la forma de las tablas.
2. Si el cambio es SQL que Drizzle no genera (RLS, indice parcial, trigger), usa
   `pnpm db:generate:custom` y escribe el SQL en el archivo vacio que emite. Si es un cambio normal,
   usa `pnpm db:generate`.
3. **No escribas ni cites el nombre del archivo generado.** Drizzle lo nombra con un sufijo
   aleatorio. Refierete a "la migracion que emitio `pnpm db:generate`".
4. Aplica a la base de pruebas: `pnpm db:migrate:test`.
5. Aplica a la base de desarrollo: `pnpm db:migrate`.
6. Si agregaste una tabla privada de un asesor, agrega su politica de RLS en la misma tanda y
   nombrala `<tabla>_<rol>_<accion>`.
7. Si el cambio necesita datos, actualiza `scripts/seed.ts` de forma idempotente y corre
   `pnpm db:seed` dos veces para probarlo.

## Verificar

```bash
pnpm db:up                                                    # expect: exit 0
pnpm db:migrate:test                                          # expect: exit 0
psql "$TEST_DATABASE_URL" -c '\d <tabla>'                     # expect: exit 0, columna presente
pnpm typecheck                                                # expect: exit 0
pnpm test tests/integration                                   # expect: exit 0, 0 failed, 0 skipped
```

## No hacer

- No editar a mano una migracion generada por `pnpm db:generate`, ni ninguna que ya corrio. La unica
  excepcion son las creadas con `--custom`, que nacen vacias para eso.
- No usar el editor de esquema del dashboard de Supabase. Es de solo lectura en este proyecto.
- No agregar una llave foranea al esquema `auth`: rompe las migraciones sobre el Postgres puro donde
  corren las pruebas.
- No aplicar migraciones al arrancar la app. Son un paso explicito de despliegue.
