import { ANALYZE_TRANSCRIPT_PROMPT } from "../src/lib/ai/prompts/analyze-transcript.ts";
import { CHAT_COVERAGE_PROMPT } from "../src/lib/ai/prompts/chat-coverage.ts";
import { COPILOT_CLASSIFY_PROMPT, COPILOT_COMPOSE_PROMPT } from "../src/lib/ai/prompts/copilot.ts";
import { EVALUATE_ANSWER_PROMPT } from "../src/lib/ai/prompts/evaluate-answer.ts";
import { GENERATE_QUESTIONS_PROMPT } from "../src/lib/ai/prompts/generate-questions.ts";
import {
  RESEARCH_PRODUCT_PROMPT,
  STRUCTURE_PRODUCT_PROMPT,
} from "../src/lib/ai/prompts/research-product.ts";
import { SAFETY_LAYER_PROMPT } from "../src/lib/ai/prompts/safety-layer.ts";
import { STRUCTURE_GAP_PROMPT, VERIFY_GAP_PROMPT } from "../src/lib/ai/prompts/verify-gap.ts";

/**
 * Nombre y cuerpo de cada prompt versionado, en un solo lugar.
 *
 * Vivia dentro de `seed.ts` como una escalera de ternarios, y publicar prompts
 * en otra base obligaba a arrastrar consigo el producto de demostracion. Aqui la
 * lista es dato: la usan la semilla local y el publicador remoto, y un prompt
 * nuevo se agrega una sola vez.
 */
export const PROMPT_SEEDS: Array<{ name: string; body: string }> = [
  { name: "generate_questions", body: GENERATE_QUESTIONS_PROMPT },
  { name: "evaluate_answer", body: EVALUATE_ANSWER_PROMPT },
  { name: "copilot_classify", body: COPILOT_CLASSIFY_PROMPT },
  { name: "copilot_compose_express", body: COPILOT_COMPOSE_PROMPT },
  { name: "copilot_compose_estandar", body: COPILOT_COMPOSE_PROMPT },
  { name: "copilot_compose_profunda", body: COPILOT_COMPOSE_PROMPT },
  { name: "analyze_transcript", body: ANALYZE_TRANSCRIPT_PROMPT },
  { name: "chat_coverage", body: CHAT_COVERAGE_PROMPT },
  { name: "research_product", body: RESEARCH_PRODUCT_PROMPT },
  { name: "structure_product", body: STRUCTURE_PRODUCT_PROMPT },
  { name: "safety_layer", body: SAFETY_LAYER_PROMPT },
  { name: "verify_gap", body: VERIFY_GAP_PROMPT },
  { name: "structure_gap", body: STRUCTURE_GAP_PROMPT },
  // Estos dos no tienen prompt escrito todavia: la fila existe para que una
  // traza pueda nombrarlos, con la misma plantilla que usaba la semilla.
  { name: "structured_repair", body: "Plantilla inicial versionada para structured_repair." },
  { name: "promote_insight", body: "Plantilla inicial versionada para promote_insight." },
];
