---
description: Convenciones de UI, tokens de Tailwind v4, accesibilidad y layout del Copilot
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/app/globals.css"
---

# UI

## Tailwind v4 se configura en CSS

- `@theme` en `src/app/globals.css` solo **mapea**: `--color-x: var(--x)`, nunca un hex. Los hex
  viven en `:root` (tema claro) y el bloque oscuro los reescribe. **No hay `tailwind.config.js`.** Si
  aparece uno es basura de v3 que se esta ignorando: borralo y porta los tokens a `@theme`.
- Las unicas excepciones con hex dentro de `@theme` son las cuatro superficies que NO siguen al
  tema: `--color-brand-panel*`, `--color-photo*`, `--color-stage*` y `--color-scrim`. Agregar una
  quinta rompe una prueba.
- Una foto de producto va siempre sobre `bg-photo`: vienen con fondo blanco opaco y sobre una placa
  oscura quedan como un recuadro.
- Para un asset que cambia de ARCHIVO segun el tema —el logo— esta el `@custom-variant dark`, que
  respeta los tres estados. El `dark:` de Tailwind por defecto solo mira `prefers-color-scheme`.
- **Nunca `text-white` encima de un relleno de token.** La tinta de un relleno es su propio token.
  En oscuro el relleno se aclara y el blanco queda en 1.92:1.
- Se conecta con `@tailwindcss/postcss` (Next/PostCSS), nunca con la entrada vieja del plugin
  `tailwindcss`.
- Biome necesita `"css": { "parser": { "tailwindDirectives": true } }` para parsear `@theme`. Ya esta
  en `biome.json`. Es un error de **parseo**, no una regla de lint: `--write` no lo arregla.

## Componentes

- Sin hex ni px sueltos. Solo nombres de token.
- **Una tarjeta se hace con `Card` o `cardClasses()`, una rejilla con `CardGrid` y una pantalla con
  `PageSection`** (`src/components/ui/`). Escribir `rounded-card border border-border bg-surface` a
  mano rompe una prueba en las pantallas ya convertidas.
- Server Component por defecto. `"use client"` en la hoja mas pequena que necesite estado o un
  handler — nunca en un layout ni en una page.
- Maximo 300 lineas por archivo.
- Un componente usado por exactamente una ruta vive junto a esa ruta.
- Densidad y velocidad por encima de animacion. Movimiento 120ms, solo `transform` y `opacity`, y
  todo respeta `prefers-reduced-motion: reduce`.

## Accesibilidad — WCAG 2.2 AA, no opcional

- Landmarks (`header`/`nav`/`main`/`footer`), un solo `h1` por pagina, encabezados en orden.
- Todo interactivo alcanzable y operable por teclado. Enlace de salto al contenido. Sin trampas de
  foco.
- Foco visible en todo elemento enfocable, ≥3:1 contra su fondo. El anillo usa `var(--primary-deep)`: 12.99:1 en claro, 9.26:1 en oscuro.
- Blancos de puntero ≥24×24 CSS px.
- Todo input con etiqueta programatica. Los errores son texto, nunca solo color, y se anuncian.
- Cambios asincronos de estado se anuncian con `aria-live` — incluida la respuesta del Copilot
  mientras llega en streaming.
- Usable al 200% de zoom y a 320 CSS px de ancho sin scroll horizontal.
- El foco nunca queda tapado por el header pegajoso ni por un toast.

## Layout del Live Copilot — literal

**Columna de entrada:** producto · pregunta de la clienta · objetivo · duracion · tono · promocion
activa · boton Generar.

**Columna de salida:** respuesta lista para decir · duracion estimada · confianza/evidencia · CTA
usado · regla comercial aplicada · alertas · acciones Copiar / Regenerar / Mas corto / Cambiar tono.

**La vista por defecto es la Express (15–20 s):** tipografia grande, una sola accion visible.
Cambiar ese default requiere cambiar `src/lib/copilot/view-defaults.ts`, que tiene una prueba
dedicada — precisamente para que nadie lo cambie por descuido.

## Estados

Toda lista y toda superficie asincrona declara los tres: **cargando, vacio y error.** El estado vacio
del Knowledge Hub dice como cargar la primera ficha; el del Copilot dice que la respuesta aparece
aqui. Un estado vacio ausente es el hueco mas comun de una UI construida por agente.
