import { TRPCError } from "@trpc/server";
import { AuthError } from "next-auth";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { registerSchema, loginSchema } from "@/infrastructure/auth/schemas";
import { db } from "@/infrastructure/db";
import { signIn, auth } from "@/auth";
import { registerUserUseCase } from "@/application";

/**
 * Auth router with register, login, and me procedures.
 *
 * Delegates all business logic to application use cases.
 */
export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      return registerUserUseCase(db as never, input);
    }),

  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input }) => {
      try {
        await signIn("credentials", {
          email: input.email,
          password: input.password,
          redirect: false,
        });
      } catch (error) {
        if (error instanceof AuthError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Credenciales inválidas",
          });
        }
        throw error;
      }

      const session = await auth();

      if (!session?.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Credenciales inválidas",
        });
      }

      return {
        user: {
          id: session.user.id as string,
          email: session.user.email as string,
          name: session.user.name as string,
          role: (session.user as { role?: string }).role ?? "PACIENTE",
        },
        expires: session.expires,
      };
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return {
      user: {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
        name: ctx.session.user.name,
        role: ctx.session.user.role,
      },
    };
  }),
});
