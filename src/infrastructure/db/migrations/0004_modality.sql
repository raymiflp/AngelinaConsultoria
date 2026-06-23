-- Migration 0004: modality toggle
-- Two new columns: citas.modalidad and doctores.acepta_online.
-- The 4-statement shape is non-negotiable (see design Section 3, tasks.md
-- gotcha #2). Statements 1 and 3 backfill existing rows in a single atomic
-- pass (Postgres >= 11 acquires an ACCESS EXCLUSIVE lock and rewrites the
-- table in one pass). Statements 2 and 4 drop the column-level default so
-- new inserts MUST specify a value explicitly; an INSERT that omits the
-- column will fail with a NOT NULL violation instead of silently defaulting
-- to 'PRESENCIAL' / false. The Drizzle schema keeps the default(...) for
-- ergonomic dev/test inserts; the migration is the runtime authority on
-- what the production schema enforces.

-- Statement 1: add modality column with default, backfill all existing rows in one atomic pass
ALTER TABLE "citas" ADD COLUMN "modalidad" varchar(20) DEFAULT 'PRESENCIAL' NOT NULL;--> statement-breakpoint

-- Statement 2: drop the default so new inserts MUST specify a value explicitly
ALTER TABLE "citas" ALTER COLUMN "modalidad" DROP DEFAULT;--> statement-breakpoint

-- Statement 3: add acepta_online column with default, backfill all existing rows in one atomic pass
ALTER TABLE "doctores" ADD COLUMN "acepta_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Statement 4: drop the default so new inserts MUST specify a value explicitly
ALTER TABLE "doctores" ALTER COLUMN "acepta_online" DROP DEFAULT;
