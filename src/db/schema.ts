import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const advisorRole = pgEnum("advisor_role", ["asesor", "admin"]);
export const advisorStatus = pgEnum("advisor_status", ["activa", "inactiva"]);
export const questionIntent = pgEnum("question_intent", [
  "informacion",
  "comparacion",
  "precio",
  "confianza",
  "uso",
  "compra",
  "seguridad",
  "objecion",
]);
export const questionDifficulty = pgEnum("question_difficulty", [
  "basica",
  "intermedia",
  "dificil",
]);
export const questionSource = pgEnum("question_source", ["seed", "generated", "live_insight"]);
export const lengthVariant = pgEnum("length_variant", ["express", "estandar", "profunda"]);
export const confidenceLevel = pgEnum("confidence_level", ["alto", "medio", "revisar"]);
export const recordingStatus = pgEnum("recording_status", [
  "uploaded",
  "transcribing",
  "transcribed",
  "analyzing",
  "analyzed",
  "failed",
]);
export const insightType = pgEnum("insight_type", [
  "faq",
  "objecion",
  "error",
  "oportunidad",
  "buena_practica",
  "riesgo_claim",
]);

export type ActiveIngredient = {
  name: string;
  amount_per_serving?: number;
  unit?: string;
  verified: boolean;
};

export type ProductBenefit = {
  rank: number;
  claim: string;
  science_note: string;
  evidence_level: "alta" | "media" | "baja";
};

export const advisors = pgTable(
  "advisors",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: advisorRole("role").notNull().default("asesor"),
    status: advisorStatus("status").notNull().default("activa"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("advisors_email_unique").on(table.email)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand").notNull(),
    category: text("category").notNull(),
    presentation: text("presentation").notNull(),
    format: text("format").notNull(),
    activeIngredients: jsonb("active_ingredients")
      .$type<ActiveIngredient[]>()
      .notNull()
      .default([]),
    benefits: jsonb("benefits").$type<ProductBenefit[]>().notNull().default([]),
    faqs: jsonb("faqs").$type<Array<{ question: string; answer: string }>>().notNull().default([]),
    objections: jsonb("objections")
      .$type<Array<{ objection: string; response: string }>>()
      .notNull()
      .default([]),
    differentiators: jsonb("differentiators")
      .$type<Array<{ claim: string; evidence: string }>>()
      .notNull()
      .default([]),
    precautions: text("precautions").notNull().default(""),
    claimsAllowed: jsonb("claims_allowed").$type<string[]>().notNull().default([]),
    claimsCaution: jsonb("claims_caution").$type<string[]>().notNull().default([]),
    claimsForbidden: jsonb("claims_forbidden").$type<string[]>().notNull().default([]),
    complementProductIds: uuid("complement_product_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    sources: jsonb("sources")
      .$type<Array<{ label: string; url?: string; note?: string }>>()
      .notNull()
      .default([]),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_verified_at_idx").on(table.verifiedAt),
    uniqueIndex("products_natural_key_unique").on(table.brand, table.name, table.presentation),
  ],
);

export const commercialRules = pgTable(
  "commercial_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("commercial_rules_key_unique").on(table.key)],
);

export const trainingQuestions = pgTable(
  "training_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    intent: questionIntent("intent").notNull(),
    difficulty: questionDifficulty("difficulty").notNull(),
    idealAnswer: text("ideal_answer").notNull(),
    criteria: jsonb("criteria").$type<string[]>().notNull().default([]),
    source: questionSource("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("training_questions_product_intent_idx").on(table.productId, table.intent),
    index("training_questions_source_idx").on(table.source),
    uniqueIndex("training_questions_product_text_unique").on(table.productId, table.text),
  ],
);

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("training_sessions_advisor_started_idx").on(table.advisorId, table.startedAt.desc()),
    index("training_sessions_product_id_idx").on(table.productId),
  ],
);

export const trainingAnswers = pgTable(
  "training_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => trainingSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => trainingQuestions.id, { onDelete: "restrict" }),
    advisorAnswer: text("advisor_answer").notNull(),
    scores: jsonb("scores").$type<Record<string, { score: number; reason: string }>>().notNull(),
    feedback: text("feedback").notNull(),
    improvedAnswer: text("improved_answer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("training_answers_session_id_idx").on(table.sessionId),
    index("training_answers_question_id_idx").on(table.questionId),
  ],
);

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ctasUsed: jsonb("ctas_used").$type<Array<{ cta: string; at: string }>>().notNull().default([]),
    promosMentioned: jsonb("promos_mentioned")
      .$type<Array<{ rule_key: string; at: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("live_sessions_advisor_started_idx").on(table.advisorId, table.startedAt.desc()),
  ],
);

export const copilotExchanges = pgTable(
  "copilot_exchanges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    customerQuestion: text("customer_question").notNull(),
    intent: questionIntent("intent").notNull(),
    answerText: text("answer_text").notNull(),
    lengthVariant: lengthVariant("length_variant").notNull().default("express"),
    durationEstimateS: integer("duration_estimate_s").notNull(),
    confidence: confidenceLevel("confidence").notNull(),
    ctaUsed: text("cta_used"),
    ruleApplied: text("rule_applied"),
    alerts: jsonb("alerts").$type<Array<{ code: string; message: string }>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("copilot_exchanges_session_created_idx").on(table.liveSessionId, table.createdAt.desc()),
    index("copilot_exchanges_product_id_idx").on(table.productId),
    check("copilot_exchanges_duration_nonnegative", sql`${table.durationEstimateS} >= 0`),
  ],
);

export const liveRecordings = pgTable(
  "live_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    status: recordingStatus("status").notNull().default("uploaded"),
    transcript: text("transcript"),
    durationS: integer("duration_s"),
    providerRequestId: text("provider_request_id"),
    callbackToken: text("callback_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("live_recordings_advisor_created_idx").on(table.advisorId, table.createdAt.desc()),
    index("live_recordings_status_idx").on(table.status),
    index("live_recordings_expires_at_idx").on(table.expiresAt),
    check(
      "live_recordings_duration_nonnegative",
      sql`${table.durationS} is null or ${table.durationS} >= 0`,
    ),
  ],
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => liveRecordings.id, { onDelete: "cascade" }),
    type: insightType("type").notNull(),
    text: text("text").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    frequency: integer("frequency").notNull().default(1),
    promotedToQuestionId: uuid("promoted_to_question_id").references(() => trainingQuestions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("insights_recording_type_idx").on(table.recordingId, table.type),
    index("insights_product_id_idx").on(table.productId),
    index("insights_promoted_question_id_idx").on(table.promotedToQuestionId),
    check("insights_frequency_positive", sql`${table.frequency} > 0`),
  ],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("prompts_name_version_unique").on(table.name, table.version),
    check("prompts_version_positive", sql`${table.version} > 0`),
  ],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id").references(() => advisors.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    finishReason: text("finish_reason").notNull(),
    error: text("error"),
    promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("llm_calls_purpose_created_idx").on(table.purpose, table.createdAt.desc()),
    index("llm_calls_advisor_created_idx").on(table.advisorId, table.createdAt.desc()),
    index("llm_calls_prompt_id_idx").on(table.promptId),
    check(
      "llm_calls_usage_nonnegative",
      sql`${table.latencyMs} >= 0 and ${table.inputTokens} >= 0 and ${table.outputTokens} >= 0 and ${table.cacheReadTokens} >= 0 and ${table.cacheWriteTokens} >= 0 and ${table.costUsd} >= 0`,
    ),
  ],
);
