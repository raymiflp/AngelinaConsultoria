import { Badge } from "@/components/ui/badge";
import { ConsultationStatus } from "@/domain/enums";

/**
 * Maps ConsultationStatus to shadcn badge variant.
 */
const STATUS_VARIANT: Record<
  ConsultationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [ConsultationStatus.PENDIENTE]: "secondary",
  [ConsultationStatus.CONFIRMADA]: "default",
  [ConsultationStatus.EN_CURSO]: "default",
  [ConsultationStatus.COMPLETADA]: "outline",
  [ConsultationStatus.CANCELADA]: "destructive",
  [ConsultationStatus.NO_ASISTIO]: "outline",
};

/**
 * Custom Tailwind classes for statuses that shadcn variants don't cover
 * (warning/ready/green — we rely on CSS classes).
 */
const STATUS_CLASS: Record<ConsultationStatus, string> = {
  [ConsultationStatus.PENDIENTE]:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [ConsultationStatus.CONFIRMADA]: "",
  [ConsultationStatus.EN_CURSO]:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [ConsultationStatus.COMPLETADA]:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  [ConsultationStatus.CANCELADA]: "",
  [ConsultationStatus.NO_ASISTIO]:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  [ConsultationStatus.PENDIENTE]: "Pendiente",
  [ConsultationStatus.CONFIRMADA]: "Confirmada",
  [ConsultationStatus.EN_CURSO]: "En curso",
  [ConsultationStatus.COMPLETADA]: "Completada",
  [ConsultationStatus.CANCELADA]: "Cancelada",
  [ConsultationStatus.NO_ASISTIO]: "No asistió",
};

interface StatusBadgeProps {
  status: ConsultationStatus;
}

/**
 * StatusBadge — renders a shadcn Badge with variant and colour mapped
 * to the given ConsultationStatus.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = STATUS_VARIANT[status];
  const customClass = STATUS_CLASS[status];
  const label = STATUS_LABEL[status];

  return (
    <Badge variant={variant} className={customClass}>
      {label}
    </Badge>
  );
}
