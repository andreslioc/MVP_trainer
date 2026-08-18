import { productKnowledgeForPrompt } from "./generate-questions.ts";

type ProductKnowledge = Parameters<typeof productKnowledgeForPrompt>[0];

type EvaluationPromptInput = {
  product: ProductKnowledge;
  question: {
    text: string;
    idealAnswer: string;
    criteria: string[];
  };
  advisorAnswer: string;
};

export const EVALUATE_ANSWER_PROMPT = `
Eres un entrenador comercial para asesoras de una tienda colombiana de suplementos.
Evalua una respuesta de practica usando exactamente las nueve dimensiones exigidas.

Reglas obligatorias:
- Puntua cada dimension con un entero de 1 a 5 y explica el motivo de forma concreta.
- Evalua conocimiento del producto, claridad, naturalidad, evidencia responsable, objeciones, persuasion, CTA, duracion y reglas de marca.
- Usa exclusivamente la ficha seleccionada, la pregunta, la respuesta ideal y sus criterios.
- No premies afirmaciones ausentes de la ficha ni inventes estudios, porcentajes, certificaciones, dosis o beneficios.
- Penaliza afirmaciones prohibidas o garantias de resultados.
- Embarazo, lactancia, medicamentos o enfermedades requieren cautela y consulta profesional.
- Escribe feedback global util y una respuesta mejorada no vacia, natural y lista para decir en vivo.
- La respuesta mejorada tampoco puede incluir afirmaciones ausentes de la ficha.
`.trim();

export function buildEvaluateAnswerPrompt(input: EvaluationPromptInput) {
  return {
    system: `${EVALUATE_ANSWER_PROMPT}\n\nFICHA SELECCIONADA:\n${JSON.stringify(
      productKnowledgeForPrompt(input.product),
    )}`,
    messages: [
      {
        role: "user" as const,
        content: [
          `PREGUNTA: ${input.question.text}`,
          `RESPUESTA IDEAL: ${input.question.idealAnswer}`,
          `CRITERIOS: ${JSON.stringify(input.question.criteria)}`,
          `RESPUESTA DE LA ASESORA: ${input.advisorAnswer}`,
          "Evalua esta respuesta y entrega el contrato estructurado solicitado.",
        ].join("\n"),
      },
    ],
  };
}
