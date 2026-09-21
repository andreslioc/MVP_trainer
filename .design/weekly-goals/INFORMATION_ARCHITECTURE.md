# Metas semanales — arquitectura de información

## Objetivo

Permitir que administración defina compromisos de capacitación verificables y que cada asesora
entienda, sin cálculos manuales, qué debe completar durante la semana y cuánto le falta.

## Navegación y permisos

- `Metas semanales` aparece en la navegación únicamente para `admin`.
- La ruta canónica de gestión es `/app/metas-semanales`.
- La asesora no configura metas: consulta su meta vigente dentro de `Inicio`.
- El acceso directo de una persona sin rango administrativo redirige a `/app`.

## Jerarquía de la pantalla administrativa

1. Contexto y selector de semana.
2. Formulario de asignación: equipo completo o una asesora.
3. Tres objetivos medibles: sesiones de Training, minutos de Pre-training y fichas distintas.
4. Seguimiento por persona con estado, porcentaje y discriminado de cada objetivo.

## Modelo mental y reglas

- La semana va de lunes a domingo en `America/Bogota`.
- Una sesión de Training cuenta solo cuando terminó y tiene al menos una respuesta evaluada.
- Pre-training usa tiempo activo, no tiempo con la pestaña abierta.
- Las fichas corresponden a productos distintos con actividad durante la semana.
- Aplicar al equipo crea una meta individual para cada asesora activa; así el histórico no cambia si
  luego entra o sale alguien.
- Estados: `Sin iniciar`, `En progreso`, `Cumplida` y `Vencida`.

## Escenarios vacíos y de error

- Sin meta: la asesora ve que aún no tiene una asignación para esa semana.
- Sin asesoras activas: el formulario explica que primero debe existir una cuenta activa.
- Valores inválidos: el formulario conserva los datos y presenta el mensaje del servidor.
