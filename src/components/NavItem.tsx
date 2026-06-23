"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavItem as NavItemConfig } from "@/components/navigation";

interface NavItemProps {
  item: NavItemConfig;
  collapsed?: boolean;
}

/**
 * Single navigation link with icon and label.
 *
 * Highlights with `bg-accent` when the current pathname starts with the
 * item's `pattern`. Optionally renders a tooltip wrapper for collapsed
 * sidebar mode.
 */
export function NavItem({ item, collapsed = false }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.pattern);

  const link = (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start gap-3",
        collapsed ? "px-3" : "px-4",
        isActive && "bg-accent text-accent-foreground",
      )}
      asChild
    >
      <Link href={item.href}>
        <item.icon className="size-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </Button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}
