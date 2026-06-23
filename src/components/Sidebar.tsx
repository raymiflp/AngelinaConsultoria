"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { navItems } from "@/components/navigation";
import { NavItem } from "@/components/NavItem";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface SidebarProps {
  collapsed?: boolean;
  userRole?: string;
}

/**
 * Application sidebar.
 *
 * Desktop: fixed `w-64` on the left, full viewport height.
 * Mobile: hidden (rendered inside a Sheet via Header).
 * Collapsed: narrow icon-only variant with tooltips.
 *
 * Filters navigation items based on user role:
 * - `roleRequired` items only visible when userRole matches
 * - Items without `roleRequired` are visible to all authenticated users
 */
export function Sidebar({ collapsed = false, userRole }: SidebarProps) {
  const filteredNavItems = navItems.filter((item) => {
    if (item.roleRequired) return userRole === item.roleRequired;
    return true;
  });

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-svh flex-col border-r bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Branding */}
      <div
        className={cn(
          "flex h-14 items-center border-b px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 font-semibold tracking-tight",
            collapsed && "justify-center",
          )}
        >
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            AC
          </div>
          {!collapsed && <span>AngelinaConsultoria</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {filteredNavItems.map((item) => (
          <NavItem key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* User section */}
      <div className="space-y-1 p-2">
        <Separator className="mb-2" />
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3",
            collapsed ? "px-3" : "px-4",
          )}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="size-5 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </Button>
      </div>
    </aside>
  );
}
