CREATE TYPE "public"."advisor_role" AS ENUM('asesor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."advisor_status" AS ENUM('activa', 'inactiva');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('alto', 'medio', 'revisar');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('faq', 'objecion', 'error', 'oportunidad', 'buena_practica', 'riesgo_claim');--> statement-breakpoint
CREATE TYPE "public"."length_variant" AS ENUM('express', 'estandar', 'profunda');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('basica', 'intermedia', 'dificil');--> statement-breakpoint
CREATE TYPE "public"."question_intent" AS ENUM('informacion', 'comparacion', 'precio', 'confianza', 'uso', 'compra', 'seguridad', 'objecion');--> statement-breakpoint
CREATE TYPE "public"."question_source" AS ENUM('seed', 'generated', 'live_insight');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('uploaded', 'transcribing', 'transcribed', 'analyzing', 'analyzed', 'failed');--> statement-breakpoint
CREATE TABLE "advisors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "advisor_role" DEFAULT 'asesor' NOT NULL,
	"status" "advisor_status" DEFAULT 'activa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"product_id" uuid,
	"customer_question" text NOT NULL,
	"intent" "question_intent" NOT NULL,
	"answer_text" text NOT NULL,
	"length_variant" "length_variant" DEFAULT 'express' NOT NULL,
	"duration_estimate_s" integer NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"cta_used" text,
	"rule_applied" text,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_exchanges_duration_nonnegative" CHECK ("copilot_exchanges"."duration_estimate_s" >= 0)
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"type" "insight_type" NOT NULL,
	"text" text NOT NULL,
	"product_id" uuid,
	"frequency" integer DEFAULT 1 NOT NULL,
	"promoted_to_question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_frequency_positive" CHECK ("insights"."frequency" > 0)
);
--> statement-breakpoint
CREATE TABLE "live_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"status" "recording_status" DEFAULT 'uploaded' NOT NULL,
	"transcript" text,
	"duration_s" integer,
	"provider_request_id" text,
	"callback_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "live_recordings_duration_nonnegative" CHECK ("live_recordings"."duration_s" is null or "live_recordings"."duration_s" >= 0)
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ctas_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promos_mentioned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"finish_reason" text NOT NULL,
	"error" text,
	"prompt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_usage_nonnegative" CHECK ("llm_calls"."latency_ms" >= 0 and "llm_calls"."input_tokens" >= 0 and "llm_calls"."output_tokens" >= 0 and "llm_calls"."cache_read_tokens" >= 0 and "llm_calls"."cache_write_tokens" >= 0 and "llm_calls"."cost_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"category" text NOT NULL,
	"presentation" text NOT NULL,
	"format" text NOT NULL,
	"active_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"differentiators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"precautions" text DEFAULT '' NOT NULL,
	"claims_allowed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claims_caution" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claims_forbidden" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"complement_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_version_positive" CHECK ("prompts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "training_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"advisor_answer" text NOT NULL,
	"scores" jsonb NOT NULL,
	"feedback" text NOT NULL,
	"improved_answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"text" text NOT NULL,
	"intent" "question_intent" NOT NULL,
	"difficulty" "question_difficulty" NOT NULL,
	"ideal_answer" text NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "question_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copilot_exchanges" ADD CONSTRAINT "copilot_exchanges_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_exchanges" ADD CONSTRAINT "copilot_exchanges_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_recording_id_live_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."live_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_promoted_to_question_id_training_questions_id_fk" FOREIGN KEY ("promoted_to_question_id") REFERENCES "public"."training_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_recordings" ADD CONSTRAINT "live_recordings_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_answers" ADD CONSTRAINT "training_answers_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_answers" ADD CONSTRAINT "training_answers_question_id_training_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."training_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_email_unique" ON "advisors" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_rules_key_unique" ON "commercial_rules" USING btree ("key");--> statement-breakpoint
CREATE INDEX "copilot_exchanges_session_created_idx" ON "copilot_exchanges" USING btree ("live_session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "copilot_exchanges_product_id_idx" ON "copilot_exchanges" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "insights_recording_type_idx" ON "insights" USING btree ("recording_id","type");--> statement-breakpoint
CREATE INDEX "insights_product_id_idx" ON "insights" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "insights_promoted_question_id_idx" ON "insights" USING btree ("promoted_to_question_id");--> statement-breakpoint
CREATE INDEX "live_recordings_advisor_created_idx" ON "live_recordings" USING btree ("advisor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "live_recordings_status_idx" ON "live_recordings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "live_recordings_expires_at_idx" ON "live_recordings" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "live_sessions_advisor_started_idx" ON "live_sessions" USING btree ("advisor_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_purpose_created_idx" ON "llm_calls" USING btree ("purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_advisor_created_idx" ON "llm_calls" USING btree ("advisor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_prompt_id_idx" ON "llm_calls" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "products_verified_at_idx" ON "products" USING btree ("verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_natural_key_unique" ON "products" USING btree ("brand","name","presentation");--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_name_version_unique" ON "prompts" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "training_answers_session_id_idx" ON "training_answers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "training_answers_question_id_idx" ON "training_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "training_questions_product_intent_idx" ON "training_questions" USING btree ("product_id","intent");--> statement-breakpoint
CREATE INDEX "training_questions_source_idx" ON "training_questions" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "training_questions_product_text_unique" ON "training_questions" USING btree ("product_id","text");--> statement-breakpoint
CREATE INDEX "training_sessions_advisor_started_idx" ON "training_sessions" USING btree ("advisor_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "training_sessions_product_id_idx" ON "training_sessions" USING btree ("product_id");