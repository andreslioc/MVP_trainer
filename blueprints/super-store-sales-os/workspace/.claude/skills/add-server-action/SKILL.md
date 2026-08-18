---
name: add-server-action
description: Usar al agregar cualquier mutacion o consulta de servidor en Super Store Sales OS — un formulario del Knowledge Hub, una regla comercial, una sesion de entrenamiento. Cubre la validacion con Zod en el borde, el chequeo de rol, el resultado tipado, el filtrado por advisor_id y la prueba de integracion que lo respalda.
---

# Agregar una server action

## Cuando usarla

Cualquier escritura o lectura nueva desde la UI hacia la base o hacia el modelo.

## Pasos

1. Define el esquema de entrada con Zod en `src/lib/validation/<dominio>.ts`. Infiere el tipo con
   `z.infer` — nunca declares el tipo dos veces.
2. Escribe la accion en `src/server/<dominio>.ts`, no en el archivo de la page. La primera linea del
   cuerpo parsea la entrada; nada sin validar llega a la logica de negocio.
3. Llama `requireRole()` de `src/lib/auth.ts` **antes** del trabajo, no despues. Esconder el boton en
   la UI no es un permiso.
4. Toda consulta sobre datos privados de un asesor filtra por `advisor_id` explicitamente, ademas de
   la politica de RLS. Las dos cosas, siempre.
5. Retorna un resultado tipado: `{ ok: true, data }` o
   `{ ok: false, error: { code, message, field? } }`. `code` sale del conjunto enumerado en
   blueprint.md §5. No lances strings.
6. Escribe la prueba en `tests/integration/<dominio>.test.ts`: camino feliz, entrada invalida con su
   `code`, y un rol sin permiso recibiendo `FORBIDDEN` con cero filas escritas.
7. Si la accion agrega una variable de entorno, agregala a `.env.example` con su proposito y de donde
   sacarla, y a la tabla de blueprint.md §17 con su columna "requerida desde el paso".

## Verificar

```bash
pnpm db:up                                        # expect: exit 0
pnpm db:migrate:test                              # expect: exit 0
pnpm test tests/integration/<dominio>.test.ts     # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                    # expect: exit 0
pnpm lint                                         # expect: exit 0
```

## No hacer

- No leer `process.env` fuera de `src/lib/env.ts`.
- No importar `src/db/` desde `src/app/**` ni desde `src/components/**`.
- No confiar en que RLS filtre por ti: el servidor conecta como superusuario.
- No devolver un mensaje de error crudo del driver de Postgres a la UI: mapealo a un `code`.
- No hardcodear el umbral de envio gratis ni el texto de una promocion. Salen de
  `commercial_rules`.
