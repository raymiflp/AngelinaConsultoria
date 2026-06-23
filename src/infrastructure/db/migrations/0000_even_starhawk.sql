CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"accion" varchar(100) NOT NULL,
	"entidad_afectada" varchar(100) NOT NULL,
	"entidad_id" varchar(100) NOT NULL,
	"detalles" jsonb,
	"direccion_ip" varchar(45) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"fecha_hora" timestamp NOT NULL,
	"estado" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"motivo" text NOT NULL,
	"duracion_minutos" integer DEFAULT 30 NOT NULL,
	"precio" numeric
);
--> statement-breakpoint
CREATE TABLE "consentimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" varchar(100) NOT NULL,
	"version" varchar(20) NOT NULL,
	"aceptado" boolean NOT NULL,
	"fecha_aceptacion" timestamp,
	"fecha_expiracion" timestamp
);
--> statement-breakpoint
CREATE TABLE "doctores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"numero_colegiado" varchar(50) NOT NULL,
	"especialidad" varchar(255) NOT NULL,
	"biografia" text,
	"precio_consulta" numeric,
	"verificado" boolean DEFAULT false NOT NULL,
	"calificacion_media" numeric,
	CONSTRAINT "doctores_numero_colegiado_unique" UNIQUE("numero_colegiado")
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"fecha_nacimiento" date NOT NULL,
	"direccion_calle" varchar(255) NOT NULL,
	"direccion_ciudad" varchar(255) NOT NULL,
	"direccion_provincia" varchar(255) NOT NULL,
	"direccion_codigo_postal" varchar(5) NOT NULL,
	"direccion_pais" varchar(100) DEFAULT 'España' NOT NULL,
	"alergias" text[] DEFAULT '{}' NOT NULL,
	"grupo_sanguineo" varchar(5),
	"notas_medicas" text
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"rol" varchar(50) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"telefono" varchar(20) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_doctor_id_doctores_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctores" ADD CONSTRAINT "doctores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;