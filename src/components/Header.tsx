"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

/**
 * Application header bar.
 *
 * Mobile: hamburger button (opens a Sheet with sidebar content), branding.
 * Desktop: branding text, spacer, theme toggle, user avatar dropdown.
 */
export function Header() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Mobile: Sheet trigger + Sheet with Sidebar */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="size-5" />
            <span className="sr-only">Abrir menú de navegación</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar userRole={userRole} />
        </SheetContent>
      </Sheet>

      {/* Branding (visible on mobile next to hamburger) */}
      <span className="font-semibold tracking-tight lg:hidden">
        AngelinaConsultoria
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu user={session?.user ?? null} />
      </div>
    </header>
  );
}
