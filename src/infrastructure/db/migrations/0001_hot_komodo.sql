CREATE TABLE "doctor_disponibilidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"disponibilidad" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_disponibilidad_doctor_id_unique" UNIQUE("doctor_id")
);
--> statement-breakpoint
ALTER TABLE "citas" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "doctor_disponibilidad" ADD CONSTRAINT "doctor_disponibilidad_doctor_id_doctores_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctores"("id") ON DELETE cascade ON UPDATE no action;