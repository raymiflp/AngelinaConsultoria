"use client";

import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

interface ShellProps {
  children: ReactNode;
}

/**
 * Application shell — persistent layout scaffold.
 *
 * CSS grid layout:
 * ┌─────────┬──────────────┐
 * │ Sidebar │  Header      │
 * │  (fixed)│──────────────│
 * │         │  <main>      │
 * │         │  (scroll)    │
 * └─────────┴──────────────┘
 *
 * On mobile (<1024px) the sidebar is hidden; navigation is accessed
 * via a Sheet drawer triggered from the Header hamburger button.
 *
 * Passes the user role to Sidebar for admin item filtering.
 */
export function Shell({ children }: ShellProps) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar userRole={userRole} />
      </div>

      {/* Main area: header + content */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
