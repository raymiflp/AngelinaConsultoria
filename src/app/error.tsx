"use client";

import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

/**
 * Global error boundary for the angelina-consultoria app.
 *
 * Catches unhandled render errors in the React tree and displays a
 * user-friendly recovery screen instead of a blank white page.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Algo salió mal</CardTitle>
          <CardDescription>
            Ocurrió un error inesperado. Ya lo registramos y lo estamos revisando.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {process.env.NODE_ENV === "development" && (
            <p className="mb-2 font-mono text-xs text-destructive">
              {error.message}
            </p>
          )}
          <p>
            Si el problema persiste, intentá recargar la página o volver al inicio.
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Button variant="outline" onClick={() => reset()}>
            <RefreshCw className="mr-2 size-4" />
            Reintentar
          </Button>
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 size-4" />
              Volver al inicio
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
