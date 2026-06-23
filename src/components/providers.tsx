"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { TRPCProvider } from "@/infrastructure/api/provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

/**
 * Composes all application-level providers:
 * 1. SessionProvider (Auth.js) — session context for useSession
 * 2. ThemeProvider (next-themes) — light/dark/system theme
 * 3. TooltipProvider (shadcn) — tooltip context
 * 4. TRPCProvider (tRPC + React Query) — API client
 *
 * Layout stays a server component by pushing the client boundary here.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <TRPCProvider>
            {children}
            <Toaster richColors closeButton />
          </TRPCProvider>
        </TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
