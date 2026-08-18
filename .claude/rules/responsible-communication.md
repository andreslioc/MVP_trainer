---
description: Reglas de comunicacion responsable sobre suplementos — es un gate, no una guia
paths:
  - "src/lib/ai/prompts/**"
  - "src/server/copilot/**"
  - "src/server/training/**"
---

# Comunicacion responsable

Esto no es tono de marca. Es el limite legal y etico del producto, y esta codificado como gate
verificable en `src/server/copilot/responsible.ts`.

## Prohibiciones absolutas

- **Ningun suplemento cura, trata ni previene enfermedades.** Ni con matices, ni "ayuda a curar", ni
  en condicional.
- **Nunca se inventan** estudios, certificaciones, porcentajes, aprobacion de la FDA, datos de
  fabricacion ni cifras de eficacia.
- **Ningun modulo genera informacion que no este en el Knowledge Hub** (`products`,
  `commercial_rules`). Si el dato no esta, la respuesta lo dice y baja el nivel de confianza. No lo
  rellena.
- Los claims prohibidos son **dato**, no texto de prompt: viven en
  `products.claims_forbidden` y en `commercial_rules`, y por eso una asesora puede corregirlos sin
  tocar codigo.

## Distincion obligatoria

Funcion fisiologica reconocida de un nutriente ≠ beneficio terapeutico. "El magnesio participa en la
funcion muscular normal" es una funcion reconocida. "El magnesio quita los calambres" es un claim
terapeutico. La primera se puede decir; la segunda no.

## Ruta de cautela obligatoria

Cuando la pregunta toca **embarazo, lactancia, medicamentos, enfermedad diagnosticada o cualquier
riesgo de salud**, la respuesta entra por la ruta de cautela: no afirma, recomienda consultar a un
profesional de salud, y marca la confianza como `revisar`. No hay excepcion por "la clienta insistio".

## Nivel de confianza

Cada respuesta del Copilot y cada evaluacion del Simulator muestra `alto` | `medio` | `revisar`:

| Nivel | Cuando |
|---|---|
| `alto` | Todo lo afirmado sale de `products` con `evidence_level` alto y `verified_at` no nulo |
| `medio` | Sale del Knowledge Hub pero con evidencia parcial o sin verificar |
| `revisar` | Se activo la ruta de cautela, o falta el dato, o hubo un refusal del modelo |

## Framework de respuesta del Copilot — en este orden

1. Respuesta directa a lo que pregunto la clienta.
2. 2–3 beneficios principales, cuando corresponda.
3. Razon cientifica breve y responsable.
4. Diferencial verificable de confianza.
5. Urgencia **solo si** la promocion es real y esta activa.
6. **Un solo** CTA.

## Duraciones

Estandar 30–45 s · **Express 15–20 s (vista por defecto)** · Profunda 60–90 s. La Express es la vista
por defecto porque la asesora esta en camara y no puede leer una pantalla larga. Es decision de
producto, no detalle de UI.

## Orquestacion comercial

- No repetir el mismo CTA en dos respuestas consecutivas cuando existan alternativas.
- Maximo **un** CTA principal por respuesta.
- Maximo **un** incentivo comercial por respuesta.
- Rotar entre: compra, asesoria, WhatsApp, seguir TikTok, promocion, envio gratis.
- Tomar en cuenta lo ya dicho en el live: `live_sessions.ctas_used` y `promos_mentioned`.
- Envio gratis y promociones salen de `commercial_rules`. **Nunca hardcodeados**, ni el umbral en
  pesos ni el texto.
