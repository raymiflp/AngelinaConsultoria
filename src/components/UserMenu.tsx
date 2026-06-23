"use client";

import Link from "next/link";
import { User, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";

interface UserMenuProps {
  user?: {
    name?: string | null;
    image?: string | null;
    role?: string | null;
  } | null;
}

/**
 * User menu dropdown.
 *
 * Authenticated: shows avatar, name, role, settings link, and logout.
 * Unauthenticated: shows a login link.
 *
 * When no `user` prop is provided, renders a login button (no dropdown).
 */
export function UserMenu({ user }: UserMenuProps) {
  if (!user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">
          <User className="mr-2 size-4" />
          Iniciar sesión
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <UserAvatar name={user.name ?? undefined} image={user.image} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium leading-none">
              {user.name ?? "Usuario"}
            </p>
            {user.role && (
              <p className="text-muted-foreground text-xs leading-none">
                {user.role}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil" className="cursor-pointer">
            <User className="mr-2 size-4" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracion" className="cursor-pointer">
            <Settings className="mr-2 size-4" />
            Configuración
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="mr-2 size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
