CREATE TABLE "doctor_condiciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_experiencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"institucion" varchar(255) NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date,
	"descripcion" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"descripcion" text,
	"precio" numeric NOT NULL,
	"duracion_minutos" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "fecha_nacimiento" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "direccion_calle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "direccion_ciudad" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "direccion_provincia" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "direccion_codigo_postal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ALTER COLUMN "direccion_pais" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "doctores" ADD COLUMN "foto_url" varchar;--> statement-breakpoint
ALTER TABLE "doctores" ADD COLUMN "ubicacion_consulta" text;--> statement-breakpoint
ALTER TABLE "doctores" ADD COLUMN "años_experiencia" integer;--> statement-breakpoint
ALTER TABLE "doctores" ADD COLUMN "idiomas" text[];--> statement-breakpoint
ALTER TABLE "doctores" ADD COLUMN "telefono_consulta" varchar;--> statement-breakpoint
ALTER TABLE "doctor_condiciones" ADD CONSTRAINT "doctor_condiciones_doctor_id_doctores_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_experiencia" ADD CONSTRAINT "doctor_experiencia_doctor_id_doctores_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_servicios" ADD CONSTRAINT "doctor_servicios_doctor_id_doctores_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doctor_condiciones_doctor_idx" ON "doctor_condiciones" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_experiencia_doctor_idx" ON "doctor_experiencia" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_servicios_doctor_idx" ON "doctor_servicios" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "citas_doctor_fecha_idx" ON "citas" USING btree ("doctor_id","fecha_hora");--> statement-breakpoint
CREATE INDEX "citas_estado_idx" ON "citas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "citas_paciente_idx" ON "citas" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "doctores_usuario_idx" ON "doctores" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "doctores_especialidad_idx" ON "doctores" USING btree ("especialidad");--> statement-breakpoint
CREATE INDEX "usuarios_rol_idx" ON "usuarios" USING btree ("rol");--> statement-breakpoint
CREATE INDEX "usuarios_activo_idx" ON "usuarios" USING btree ("activo");