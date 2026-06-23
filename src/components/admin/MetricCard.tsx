"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  /** Título de la métrica */
  title: string;
  /** Valor numérico a mostrar */
  value: string | number;
  /** Icono opcional */
  icon?: LucideIcon;
  /** Tendencia opcional (ej: "+12%") */
  trend?: string;
  /** Indica si la tendencia es positiva */
  trendUp?: boolean;
  /** Descripción opcional */
  description?: string;
}

/**
 * MetricCard — tarjeta simple para mostrar una métrica en el dashboard.
 *
 * Muestra título, valor, icono opcional y tendencia.
 */
export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  description,
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(trend || description) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {trend && (
              <span
                className={
                  trendUp
                    ? "text-success font-medium"
                    : "text-destructive font-medium"
                }
              >
                {trend}{" "}
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
