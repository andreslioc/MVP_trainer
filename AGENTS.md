# Super Store Sales OS — instrucciones para agentes

Herramienta interna de capacitacion y asistencia comercial para las asesoras de Super Store (tienda
de suplementos que vende por TikTok Live en Colombia). Tres modulos: Training Simulator, Live Copilot
y Live Intelligence, sobre una sola fuente de verdad.

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
| Base de pruebas | `pnpm db:up` · `pnpm db:down` · `pnpm db:reset` |
| Migraciones | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:migrate:test` |
| Semillas | `pnpm db:seed` |
| Entorno local | `pnpm env:local` · `pnpm env:local:supabase` |
| Supabase | `pnpm supabase:check` · `pnpm supabase:start` · `pnpm supabase:stop` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.
Los pasos 1 y 2 solo necesitan `pnpm db:up`; `pnpm supabase:start` se requiere desde el paso 3.

## No negociable

1. **Drizzle es el unico dueno del esquema.** El editor del dashboard de Supabase es de solo lectura.
2. **La app usa el pooler; migraciones y scripts usan la URL directa.**
3. **Las migraciones son un paso explicito de despliegue, jamas al arrancar la app.**
4. **El header del proveedor (`x-goog-api-key`) aparece en exactamente un archivo:** `src/lib/ai/gateway.ts`.
5. **Ningun suplemento cura, trata ni previene enfermedades.** Nada de estudios, certificaciones,
   porcentajes ni aprobaciones inventadas. Embarazo, lactancia, medicamentos o enfermedad entran por
   la ruta de cautela obligatoria.
6. **Ningun modulo inventa informacion fuera del Knowledge Hub** (`products`, `commercial_rules`).
7. **La vista por defecto del Copilot es la respuesta Express de 15–20 s.**
8. **Especificadores relativos con extension `.ts` / `.tsx`.** El alias `@/` no se usa.
9. Nunca commitear secretos, `.env` ni output de build.
10. Nunca marcar una tarea como hecha con un comando del gate fallando.

Arquitectura completa, fronteras de import, tokens de diseno y reglas por area: ver `CLAUDE.md` en
este mismo directorio, que es la fuente canonica.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
