# Super Store Sales OS

Herramienta interna de capacitación y asistencia comercial para las asesoras de Super Store, una
tienda de suplementos que vende por TikTok Live en Colombia.

Tres módulos sobre una sola fuente de verdad:

| Módulo | Cuándo | Qué hace |
|---|---|---|
| **Training Simulator** | antes del live | Practica preguntas reales. Incluye un simulacro con cámara, chat corriendo y respuesta por voz |
| **Live Copilot** | durante el live | Convierte una pregunta de clienta en una respuesta lista para decir en cámara, en 15–20 s |
| **Live Intelligence** | después del live | Sube la grabación, la transcribe y encuentra qué preguntaron y qué quedó sin responder |

El ciclo se cierra: los hallazgos de un live real se convierten en material de práctica para el
siguiente.

## Arranque

```bash
pnpm install --frozen-lockfile
pnpm supabase:start          # Supabase local en Docker
pnpm env:local:supabase      # escribe .env.local con las llaves locales
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev                     # http://localhost:3000
```

## Comandos

| Tarea | Comando |
|---|---|
| Gate completo | `pnpm typecheck && pnpm lint && pnpm test` |
| Pruebas | `pnpm test` · E2E: `pnpm test:e2e` |
| Migración | `pnpm db:generate` → `pnpm db:migrate` |
| Revisar entorno antes de desplegar | `pnpm env:check` |

Ninguna tarea se marca como hecha con un comando del gate fallando.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM · Postgres (Supabase) · Supabase
Auth y Storage · Gemini · Groq y Deepgram para transcripción · Vercel.

## Reglas que no se negocian

- **Ningún suplemento cura, trata ni previene enfermedades.** Ni un estudio, porcentaje o
  certificación inventados. Embarazo, lactancia, medicamentos o enfermedad entran por la ruta de
  cautela obligatoria.
- **Ningún módulo genera información fuera del Knowledge Hub.** Si el dato no está en `products` ni
  en `commercial_rules`, la respuesta lo dice; no lo rellena.
- **Drizzle es el único dueño del esquema.** Las migraciones son un paso explícito de despliegue,
  jamás al arrancar la app.

Las convenciones completas están en [CLAUDE.md](CLAUDE.md) y en `.claude/rules/`.
