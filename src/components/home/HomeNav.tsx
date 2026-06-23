"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu } from "@/components/UserMenu";

/**
 * Public marketing top bar for the home page (`/`).
 *
 * Anonymous: brand link + "Iniciar sesión" + "Registrarse" Button.
 * Authenticated: brand link + UserMenu.
 *
 * Mobile (<768px): collapses the right actions into a hamburger button
 * that opens a shadcn Sheet with the same destination links.
 *
 * Sticky frosted-glass background, top of the viewport (z-50).
 */
export function HomeNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Brand */}
        <Link
          href="/"
          className="text-base font-semibold tracking-tight"
        >
          AngelinaConsultoria
        </Link>

        {/* Desktop right actions (≥768px) */}
        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <UserMenu user={session!.user} />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Iniciar sesión</Link>
              </Button>
              <Button asChild>
                <Link href="/registro">Registrarse</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger (<768px) */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            {/* Visually hidden title keeps Radix accessible to screen readers
                while the existing layout is preserved. */}
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <div className="mt-8 flex flex-col gap-4">
              {isAuthenticated ? (
                <div className="flex justify-center">
                  <UserMenu user={session!.user} />
                </div>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="w-full justify-center"
                    asChild
                  >
                    <Link
                      href="/login"
                      onClick={() => setSheetOpen(false)}
                    >
                      Iniciar sesión
                    </Link>
                  </Button>
                  <Button
                    className="w-full justify-center"
                    asChild
                  >
                    <Link
                      href="/registro"
                      onClick={() => setSheetOpen(false)}
                    >
                      Registrarse
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
