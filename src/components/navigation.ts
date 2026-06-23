import {
  LayoutDashboard,
  Stethoscope,
  Calendar,
  Users,
  UserCircle,
  Settings,
  Shield,
  Clock,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation item configuration.
 *
 * `label` — display text
 * `href` — route path
 * `icon` — lucide-react icon component
 * `pattern` — URL pattern for active-state matching (starts-with)
 * `roleRequired` — if set, only users with this role should see the item.
 *                  `undefined` means visible to all authenticated users.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  pattern: string;
  roleRequired?: "ADMIN" | "DOCTOR" | "PACIENTE";
}

/**
 * Main navigation items for the application sidebar.
 *
 * Labels are in Spanish for the target audience.
 */
export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    pattern: "/dashboard",
  },
  {
    label: "Doctores",
    href: "/dashboard/doctores",
    icon: Shield,
    pattern: "/dashboard/doctores",
    roleRequired: "ADMIN",
  },
  {
    label: "Doctores",
    href: "/doctores",
    icon: Stethoscope,
    pattern: "/doctores",
    roleRequired: "PACIENTE",
  },
  {
    label: "Citas",
    href: "/citas",
    icon: Calendar,
    pattern: "/citas",
  },
  {
    label: "Pacientes",
    href: "/dashboard/pacientes",
    icon: Users,
    pattern: "/dashboard/pacientes",
    roleRequired: "DOCTOR",
  },
  {
    label: "Disponibilidad",
    href: "/dashboard/disponibilidad",
    icon: Clock,
    pattern: "/dashboard/disponibilidad",
    roleRequired: "DOCTOR",
  },
  {
    label: "Agenda",
    href: "/dashboard/agenda",
    icon: ClipboardList,
    pattern: "/dashboard/agenda",
    roleRequired: "DOCTOR",
  },
  {
    label: "Perfil",
    href: "/perfil",
    icon: UserCircle,
    pattern: "/perfil",
  },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    pattern: "/configuracion",
  },
];
