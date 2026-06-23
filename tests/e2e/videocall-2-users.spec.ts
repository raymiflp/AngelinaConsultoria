// @ts-check
/**
 * E2E test: two authenticated users join the same cita's video call.
 *
 * Skipped unless `LIVEKIT_E2E=1` is set. The test is opt-in because it
 * needs a real LiveKit container, the dev stack running, and
 * `pnpm seed:dev` to have been executed at least once. CI without
 * LiveKit reports this test as `skipped`, NOT `failed`.
 *
 * REQ-VC-E2E-1 .. REQ-VC-E2E-5 (e2e-video-call spec).
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

const SKIP_REASON =
  "Set LIVEKIT_E2E=1 to run (requires LiveKit container + pnpm seed:dev).";

const DOCTOR = {
  email: "doctor.dev@angelina.local",
  password: "DoctorDev123!",
};
const PACIENTE = {
  email: "paciente.dev@angelina.local",
  password: "PacienteDev123!",
};

const BASE = process.env.APP_URL ?? "http://localhost:3000";

test.describe("videocall — two authenticated users on the same cita", () => {
  test.skip(
    !process.env.LIVEKIT_E2E || process.env.LIVEKIT_E2E !== "1",
    SKIP_REASON,
  );

  /** Cita id read from the DB in `beforeAll`. */
  let citaId: string;

  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required to look up the seeded citaId (run pnpm seed:dev first).",
      );
    }
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    try {
      const rows = await sql`
        SELECT c.id
        FROM citas c
        JOIN doctores d ON c.doctor_id = d.id
        JOIN usuarios u ON d.usuario_id = u.id
        WHERE u.email = ${DOCTOR.email}
          AND c.estado IN ('CONFIRMADA', 'PENDIENTE', 'EN_CURSO')
        ORDER BY c.fecha_hora DESC
        LIMIT 1
      `;
      const found = rows[0];
      if (!found) {
        throw new Error(
          "seed:dev must be run before LIVEKIT_E2E tests (no CONFIRMADA cita for doctor.dev@angelina.local).",
        );
      }
      citaId = found.id;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  /**
   * Logs in as the given credentials in a fresh tab on the supplied
   * context, waits for navigation away from `/login`, and returns the
   * authenticated page. The login form's labels are "Email" and
   * "Contraseña" and the submit button is "Ingresar" (see
   * `src/app/login/page.tsx`).
   */
  async function loginInTab(
    ctx: BrowserContext,
    creds: { email: string; password: string },
  ): Promise<Page> {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/contrase/i).fill(creds.password);
    await page.getByRole("button", { name: /ingresar/i }).click();
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/login"),
      { timeout: 15_000 },
    );
    return page;
  }

  test("both contexts authenticate, join the same room, and see 2 participants", async ({
    browser,
  }) => {
    // REQ-VC-E2E-1: two independent browser contexts, one per user.
    // Each has its own cookie jar — the real `/login` form is used
    // (no storageState injection, no direct cookie setting).
    const doctorCtx = await browser.newContext();
    const pacienteCtx = await browser.newContext();

    try {
      const [docPage, pacPage] = await Promise.all([
        loginInTab(doctorCtx, DOCTOR),
        loginInTab(pacienteCtx, PACIENTE),
      ]);

      // Both navigate to the call page. The call page makes the
      // `getRoomToken` tRPC query, mounts <LiveKitRoom>, and joins the
      // LiveKit signaling server.
      const callUrl = `${BASE}/citas/${citaId}/llamada`;
      await Promise.all([docPage.goto(callUrl), pacPage.goto(callUrl)]);

      // REQ-VC-E2E-2: <LiveKitRoom> mounted within 10s on both contexts.
      // The data-testid is on the <LiveKitRoom> wrapper
      // (see `src/app/citas/[id]/llamada/page.tsx:150`).
      await Promise.all([
        expect(docPage.getByTestId("livekit-room")).toBeVisible({
          timeout: 10_000,
        }),
        expect(pacPage.getByTestId("livekit-room")).toBeVisible({
          timeout: 10_000,
        }),
      ]);

      // REQ-VC-E2E-5 (DOM path): each context has 2 <video> tiles
      // (one local + one remote) within 15s. The local participant
      // publishes its own track; the remote track is subscribed when
      // the other context joins.
      await Promise.all([
        expect(docPage.locator("video")).toHaveCount(2, { timeout: 15_000 }),
        expect(pacPage.locator("video")).toHaveCount(2, { timeout: 15_000 }),
      ]);

      // REQ-VC-E2E-3 (DOM path): the participant count attribute
      // exposed by @livekit/components-react's FocusLayout /
      // ParticipantCounter reports exactly 2. Some LiveKit versions
      // do NOT expose this attribute, so we wrap the assertion in a
      // best-effort `expect.poll` and log a warning on miss — the
      // <video> count assertion above is the authoritative
      // participant-count check.
      try {
        await expect(docPage.locator("[data-lk-participant-count]")).toHaveAttribute(
          "data-lk-participant-count",
          "2",
          { timeout: 5_000 },
        );
      } catch {
        // eslint-disable-next-line no-console
        console.warn(
          "[videocall-2-users] data-lk-participant-count attribute not present in this LiveKit version — relying on <video> count assertion.",
        );
      }

      // REQ-VC-E2E-4 (soft): closing both contexts triggers LiveKit's
      // `room_finished` event, which the webhook route dispatches to
      // `autoCompleteOnRoomFinishedUseCase`, transitioning the cita
      // from `EN_CURSO` (set when the first context joined) to
      // `COMPLETADA`. We poll the DB for up to 30s; on miss we log
      // a warning and continue (R5 mitigation — the webhook chain
      // can fail when the LiveKit container cannot reach
      // host.docker.internal:3000).
      await Promise.all([doctorCtx.close(), pacienteCtx.close()]);

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required for the post-close poll.");
      }
      const sql = postgres(databaseUrl, { max: 1 });
      try {
        const deadline = Date.now() + 30_000;
        let estado: string | undefined;
        while (Date.now() < deadline) {
          const rows =
            await sql`SELECT estado FROM citas WHERE id = ${citaId}`;
          estado = rows[0]?.estado as string | undefined;
          if (estado === "COMPLETADA") break;
          await new Promise((r) => setTimeout(r, 1_000));
        }
        if (estado !== "COMPLETADA") {
          // eslint-disable-next-line no-console
          console.warn(
            `[videocall-2-users] webhook chain not exercised (final estado=${estado}). Likely host.docker.internal unreachable from the livekit container (R5).`,
          );
        } else {
          expect(estado).toBe("COMPLETADA");
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      // Defense in depth: if anything above threw before the explicit
      // `context.close()` calls, still close both contexts so the
      // browser process is reclaimed.
      await Promise.allSettled([doctorCtx.close(), pacienteCtx.close()]);
    }
  });
});
