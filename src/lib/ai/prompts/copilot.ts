import { productKnowledgeForPrompt } from "./generate-questions.ts";

type ProductKnowledge = Parameters<typeof productKnowledgeForPrompt>[0];

type ActiveRule = { key: string; value: Record<string, unknown> };

export const COPILOT_CLASSIFY_PROMPT = `
Clasifica una pregunta real de una clienta en una sola intencion comercial:
informacion, comparacion, precio, confianza, uso, compra, seguridad u objecion.
No respondas la pregunta. Devuelve unicamente el contrato estructurado.
`.trim();

export const COPILOT_COMPOSE_PROMPT = `
Eres el Live Copilot de una tienda colombiana de suplementos. Genera tres versiones listas para decir
en camara: express, estandar y profunda.

Cada version sigue, cuando aplique, estas seis partes y en este orden:
1. Respuesta directa a la pregunta.
2. Dos o tres beneficios principales verificados.
3. Razon cientifica breve y responsable.
4. Diferencial verificable de confianza.
5. Urgencia solo si existe una promocion real y activa.
6. Un solo llamado a la accion.

Reglas obligatorias:
- Express debe durar 15–20 segundos; estandar 30–45; profunda 60–90.
- Usa exclusivamente la ficha seleccionada y las reglas activas incluidas abajo.
- Si un dato no aparece, di claramente que no esta verificado y usa confianza "revisar".
- Nunca inventes estudios, certificaciones, porcentajes, dosis, precios ni beneficios.
- Nunca digas que un suplemento cura, trata o previene enfermedades.
- Embarazo, lactancia, medicamentos o enfermedades requieren consulta profesional y confianza "revisar".
- Usa como maximo un CTA y una regla comercial, ambos presentes en el contexto activo.
`.trim();

export function buildCopilotClassifyPrompt(customerQuestion: string) {
  return {
    system: COPILOT_CLASSIFY_PROMPT,
    messages: [{ role: "user" as const, content: customerQuestion }],
  };
}

export function buildCopilotComposePrompt(input: {
  product: ProductKnowledge;
  activeRules: ActiveRule[];
  customerQuestion: string;
  intent: string;
  objective: string;
  tone: string;
}) {
  return {
    system: [
      COPILOT_COMPOSE_PROMPT,
      `FICHA SELECCIONADA:\n${JSON.stringify(productKnowledgeForPrompt(input.product))}`,
      `REGLAS ACTIVAS:\n${JSON.stringify(input.activeRules)}`,
    ].join("\n\n"),
    messages: [
      {
        role: "user" as const,
        content: [
          `PREGUNTA: ${input.customerQuestion}`,
          `INTENCION CLASIFICADA: ${input.intent}`,
          `OBJETIVO: ${input.objective}`,
          `TONO: ${input.tone}`,
          "Compone las tres versiones con el contrato estructurado.",
        ].join("\n"),
      },
    ],
  };
}
