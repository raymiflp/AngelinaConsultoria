import { router } from "../trpc";
import { authRouter } from "./auth";
import { profilesRouter } from "./profiles";
import { bookingsRouter } from "./bookings";
import { availabilityRouter } from "./availability";
import { adminRouter } from "./admin";

/**
 * Root application router combining all domain sub-routers.
 * This is the single router consumed by the HTTP handler and client.
 */
export const appRouter = router({
  auth: authRouter,
  profiles: profilesRouter,
  bookings: bookingsRouter,
  availability: availabilityRouter,
  admin: adminRouter,
});

/**
 * Type of the full app router — used by the client for end-to-end type safety.
 */
export type AppRouter = typeof appRouter;
