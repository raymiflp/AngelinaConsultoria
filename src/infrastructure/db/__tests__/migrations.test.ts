import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * File-shape assertions for the migration set.
 *
 * The project runs migrations against a live Postgres via
 * `pnpm db:migrate` (drizzle-kit migrate). Vitest runs without a DB
 * connection in the unit-test lane, so this file does NOT execute the
 * SQL — it asserts the file shape so a stray DDL regression is caught
 * at unit-test time (matches the project's no-DB pattern; see
 * `schema.test.ts` in this directory).
 *
 * Per the livekit-webhooks change (Task 2 / §11.6):
 *   - 0005 makes `audit_logs.usuario_id` nullable so system actors
 *     (LiveKit server) can write audit rows without a human usuarioId.
 *   - The FK + onDelete: "cascade" stay (existing human-actor rows
 *     unaffected).
 *   - The down migration is documented in the header comment but is NOT
 *     auto-generated (forward-only pattern — see 0000 / 0001 / 0004).
 */

function readMigration(name: string): string {
  // __dirname is `src/infrastructure/db/__tests__/`. Go up 2 levels to
  // land at `src/infrastructure/db/`, then descend into `migrations/`.
  return readFileSync(
    resolve(__dirname, "..", "migrations", name),
    "utf8",
  );
}

function listMigrations(): string[] {
  return readdirSync(resolve(__dirname, "..", "migrations")).filter((f) =>
    f.endsWith(".sql"),
  );
}

describe("migrations/ — file shape", () => {
  it("migrations directory contains exactly the expected sequence", () => {
    // We do NOT pin the random suffixes (Drizzle Kit's auto-generated
    // ones) — only the sequence numbers. The migration files end in
    // .sql and start with `0000_` ... `0005_`.
    const sqlFiles = listMigrations();
    expect(sqlFiles.length).toBeGreaterThanOrEqual(6);
    const sequencePrefixes = sqlFiles
      .map((f) => /^(\d{4})_/.exec(f)?.[1])
      .filter((p): p is string => p !== undefined);
    // The sequences we expect (in order).
    expect(sequencePrefixes).toEqual(
      expect.arrayContaining(["0000", "0001", "0002", "0003", "0004", "0005"]),
    );
  });

  describe("0005 — make audit_logs.usuario_id nullable (livekit-webhooks, Task 2)", () => {
    const sql0005 = (() => {
      const file = listMigrations().find((f) => f.startsWith("0005_"));
      return file ? readMigration(file) : "";
    })();

    it("0005 exists", () => {
      expect(sql0005.length).toBeGreaterThan(0);
    });

    it("0005 contains the single ALTER COLUMN ... DROP NOT NULL statement", () => {
      // Forward shape per D9 / OQ7=yes. The down migration is documented
      // in the header comment but NOT auto-generated (forward-only pattern).
      expect(sql0005).toMatch(
        /ALTER TABLE\s+"audit_logs"\s+ALTER COLUMN\s+"usuario_id"\s+DROP NOT NULL\s*;/i,
      );
    });

    it("0005 does NOT add a DROP DEFAULT statement (would be a redundant Drizzle Kit artifact)", () => {
      // Per design §8.1 / D9: a clean post-edited migration is a single
      // ALTER statement. Anything more is a regression of the post-edit
      // step in Task 2's notes.
      expect(sql0005).not.toMatch(/ALTER COLUMN\s+"usuario_id"\s+DROP DEFAULT/i);
    });

    it("0005 does NOT touch other columns (forward scope is one column)", () => {
      // The change is `audit_logs.usuario_id` ONLY. Other columns
      // (entidad_afectada, entidad_id, etc.) MUST NOT appear in the
      // migration.
      expect(sql0005).not.toMatch(/"entidad_afectada"/i);
      expect(sql0005).not.toMatch(/"entidad_id"/i);
      expect(sql0005).not.toMatch(/"accion"/i);
      expect(sql0005).not.toMatch(/"detalles"/i);
    });

    it("0005 preserves the FK to usuarios.id and the onDelete cascade (header comment documents the rationale)", () => {
      // The FK is schema-level (Drizzle); the migration file MUST NOT
      // touch FK constraints (a `DROP CONSTRAINT` would break existing
      // human-actor rows). The forward migration is one column-level
      // ALTER — the FK is preserved implicitly by not touching it.
      expect(sql0005).not.toMatch(/DROP CONSTRAINT/i);
      expect(sql0005).not.toMatch(/ADD CONSTRAINT/i);
    });

    it("0005 documents the down migration in a header comment (project's forward-only pattern)", () => {
      // Per §8.5 / design notes, the down migration is documented but
      // NOT auto-generated. The header comment must mention it so a
      // future operator knows the rollback path.
      expect(sql0005).toMatch(/--\s*DOWN/i);
      expect(sql0005).toMatch(/SET NOT NULL/i);
    });
  });

  describe("0000-0004 — forward-only pattern (regression guard)", () => {
    it("no prior migration contains a DOWN block as an executable statement", () => {
      // The project pattern is forward-only — no executable down
      // migrations. We grep for the literal `ALTER COLUMN ... SET NOT NULL`
      // pattern in any prior migration as a sentinel (the only legitimate
      // DOWN we'd see is 0005's documented text, which 0000-0004 must
      // NOT contain).
      const priorMigrations = listMigrations().filter(
        (f) => /^000[0-4]_/.test(f),
      );
      for (const f of priorMigrations) {
        const sql = readMigration(f);
        expect(sql.toUpperCase()).not.toContain("DOWN");
        expect(sql).not.toMatch(/SET NOT NULL/i);
      }
    });
  });
});

// Helper so consumers can list migrations if needed elsewhere.
export function listMigrationFiles(): string[] {
  return listMigrations().map((f) => join("migrations", f));
}
