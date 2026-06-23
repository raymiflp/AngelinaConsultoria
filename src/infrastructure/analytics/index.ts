import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export function getAnalyticsClient(): PostHog | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
  if (!apiKey) return null;
  if (!client) {
    client = new PostHog(apiKey, { host });
  }
  return client;
}

export async function captureEvent(params: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}) {
  try {
    const cl = getAnalyticsClient();
    if (!cl) return;
    cl.capture({
      distinctId: params.distinctId,
      event: params.event,
      properties: params.properties,
    });
  } catch {
    // Analytics must never throw — silent no-op on failure
  }
}
