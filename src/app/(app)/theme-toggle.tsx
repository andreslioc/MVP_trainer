"use client";

import { useState, useTransition } from "react";

import {
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEMES,
  type Theme,
  themeAttribute,
} from "../../lib/theme.ts";
import { setThemeAction } from "./theme-actions.ts";

/**
 * El interruptor de tema. La hoja cliente mas pequeña que puede hacerlo.
 *
 * El clic hace dos cosas en dos tiempos. Primero toca `data-theme` en el
 * documento, que es instantaneo: cambiar de tema es una linea de CSS y no puede
 * esperar un viaje de red con la asesora en camara. Despues, en una transicion,
 * le pide al servidor que guarde la cookie — eso es para el render SIGUIENTE, y
 * es lo que evita el destello de claro al recargar.
 *
 * Tres opciones y no un boton de dos estados: "automático" es un estado real y
 * distinto de "claro", porque significa seguir cambiando con el dispositivo.
 */
export function ThemeToggle({
  className = "",
  initialTheme,
}: {
  /**
   * Quien lo usa decide donde aparece. En el header se esconde en pantalla
   * angosta —ahi no cabe— y reaparece dentro del menu movil: la asesora trabaja
   * desde el celular con la camara encendida, y es justo donde mas importa poder
   * bajarle la luz a la pantalla.
   */
  className?: string;
  initialTheme: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [, startTransition] = useTransition();

  function choose(next: Theme) {
    setTheme(next);
    const attribute = themeAttribute(next);
    if (attribute) {
      document.documentElement.dataset.theme = attribute;
    } else {
      // Sin atributo vuelve a mandar `prefers-color-scheme`, que es lo que
      // significa "automático".
      delete document.documentElement.dataset.theme;
    }
    startTransition(() => {
      void setThemeAction(next);
    });
  }

  return (
    <fieldset
      className={`min-w-0 rounded-card border border-border-control p-0.5 ${className}`.trim()}
    >
      <legend className="sr-only">Tema de la interfaz</legend>
      {THEMES.map((option) => (
        <button
          aria-pressed={theme === option}
          className={`min-h-9 rounded-card px-2.5 text-xs font-semibold ${
            theme === option
              ? "bg-primary-deep text-primary-fg"
              : "text-fg-muted hover:bg-primary-tint hover:text-primary-deep"
          }`}
          key={option}
          onClick={() => choose(option)}
          title={THEME_DESCRIPTIONS[option]}
          type="button"
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </fieldset>
  );
}
