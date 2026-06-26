import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/infrastructure/db";
import { usuarios } from "@/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { verify } from "@/infrastructure/auth/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // ADR-0001: Vercel terminates TLS at the edge and proxies to the Function
  // with an internal HTTP origin. NextAuth v5 cannot auto-detect the
  // canonical URL without this flag — without it, "UntrustedHost" errors
  // fire on every auth route.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await db
          .select()
          .from(usuarios)
          .where(eq(usuarios.email, email.toLowerCase().trim()))
          .then((rows) => rows[0] ?? null);

        if (!user) return null;

        const isValid = await verify(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.nombre,
          role: user.rol,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
        (session.user as unknown as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
});
