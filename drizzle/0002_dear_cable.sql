ALTER TABLE "training_answers" ALTER COLUMN "scores" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_answers" ALTER COLUMN "feedback" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_answers" ALTER COLUMN "improved_answer" DROP NOT NULL;