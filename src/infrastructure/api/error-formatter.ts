import { TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import { ZodError } from "zod";

/**
 * Custom error formatter for tRPC.
 *
 * - Zod validation errors are serialised into a `fieldErrors` map
 *   with per-field messages.
 * - Known TRPCErrors preserve their code and message (stack traces stripped).
 * - Unknown errors fall through to the default shape.
 */
export function errorFormatter(opts: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}) {
  return {
    ...opts.shape,
    data: {
      ...opts.shape.data,
      fieldErrors:
        opts.error.cause instanceof ZodError
          ? opts.error.cause.flatten().fieldErrors
          : null,
    },
  };
}
