import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Shell } from "@/components/Shell";

/**
 * Dashboard layout — server component.
 *
 * Authenticates the user and wraps children in the Shell layout.
 * Each dashboard sub-page handles its own role-based authorization
 * via tRPC or layout-level checks.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <Shell>{children}</Shell>;
}
