/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// ── LiveKit env stubs ───────────────────────────────────────────────────
// The `LiveKitServerClient` module-level singleton throws if the env vars
// are missing at import time (eager boot-time validation per AD-7 / REQ-LK-INF-4).
// Tests need the module to load successfully, so we seed it with the dev
// defaults here. The dedicated env-validation test (livekit-server.test.ts)
// deletes these in `beforeEach` and re-sets them per scenario.
process.env.LIVEKIT_API_KEY ??= "devkey";
process.env.LIVEKIT_API_SECRET ??= "secret";
process.env.NEXT_PUBLIC_LIVEKIT_URL ??= "ws://localhost:7880";

// Mock Next.js router and navigation for component tests
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
