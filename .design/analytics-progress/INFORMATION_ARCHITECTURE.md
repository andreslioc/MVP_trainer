# Arquitectura de información: seguimiento de aprendizaje

## Mapa

- Analíticas `/app/analiticas`
  - Asesora `/app/analiticas/[advisorId]?periodo=dia|semana|mes|todo`
    - Actividad y tiempo de uso
    - Evolución y resumen de progreso
    - Habilidades por reforzar
    - Actividad en vivo
    - Historial de prácticas `/app/analiticas/[advisorId]/practicas`

## Modelo de navegación

- La navegación principal conserva `Analíticas`; no aparece un módulo paralelo.
- El selector de periodo controla todas las cifras y gráficas de la vista.
- El historial de prácticas sigue siendo el nivel de detalle desde el que se revisa una respuesta.
- En móvil las secciones se apilan y la línea de tiempo conserva desplazamiento visual sin controles
  adicionales.

## Jerarquía de contenido

### Analítica de una asesora

1. Periodo: contexto obligatorio para interpretar cualquier número.
2. Resumen de progreso: qué cambió y cuál es la prioridad de acompañamiento.
3. Tiempo de uso: total, Training, Pre-training y constancia por día.
4. Evolución: acierto, volumen de respuestas y comparación contra el periodo anterior.
5. Dimensiones de la rúbrica: evidencia detallada detrás del resumen.
6. Actividad en vivo e historial: contexto operativo y respuestas concretas.

## Flujos

### Revisar el avance de una asesora

1. Supervisión abre Analíticas y elige una asesora.
2. Selecciona Hoy, 7 días, 30 días o Todo.
3. Lee el resumen comparativo y distingue avance de prioridad actual.
4. Contrasta el tiempo invertido en Pre-training y Training en la línea diaria.
5. Baja a la tabla de dimensiones o abre una práctica para revisar evidencia concreta.

## Convenciones de nombres

| Concepto | Etiqueta | Criterio |
|---|---|---|
| Lectura de fichas | Pre-training | Nombre existente en navegación |
| Práctica con preguntas | Training | Nombre existente en navegación |
| Tiempo combinado | Tiempo de aprendizaje | Suma de ambos módulos medidos |
| Cambio entre periodos | Evolución | Comparación, no promesa causal |
| Dimensión más baja | Prioridad actual | Evita etiquetar a la persona como un fallo |

## Reutilización

| Componente | Uso |
|---|---|
| `PeriodTabs` | Controla toda la vista |
| `MetricCard` | Totales de tiempo y volumen |
| `UsageTimeline` | Pre-training y Training por día |
| `ProgressSummary` | Síntesis comparativa y prioridad |
| `DimensionTable` | Evidencia detallada por habilidad |

## Crecimiento

La línea acepta hasta 30 puntos visibles. `Todo` conserva totales históricos pero compara y dibuja
los últimos 30 días, evitando una gráfica ilimitada. Nuevos módulos solo entran cuando tengan tiempo
activo confiable; no se infiere duración por una pestaña o sesión abierta.

## Estrategia de URL

- Se conserva `/app/analiticas/[advisorId]`.
- `periodo` sigue siendo el único parámetro y gobierna todas las secciones.
- No se agregan anclas o subrutas hasta que alguna sección tenga acciones propias.
