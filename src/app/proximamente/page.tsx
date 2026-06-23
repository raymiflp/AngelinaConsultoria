import type { Metadata } from "next";
import Link from "next/link";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Próximamente",
  description:
    "Esta funcionalidad está en desarrollo y estará disponible próximamente.",
};

interface ProximamentePageProps {
  searchParams: Promise<{ feature?: string }>;
}

export default async function ProximamentePage({
  searchParams,
}: ProximamentePageProps) {
  const params = await searchParams;
  const feature = params.feature;

  return (
    <main className="container mx-auto max-w-2xl px-4 py-16 text-center">
      <Construction className="text-muted-foreground mx-auto size-12" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Próximamente</h1>
      <p className="text-muted-foreground mt-3">
        {feature
          ? `La funcionalidad "${feature}" está en desarrollo.`
          : "Esta funcionalidad está en desarrollo."}{" "}
        Estamos trabajando para lanzarla lo antes posible.
      </p>

      <Separator className="my-8" />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contacto">Sugerir mejora</Link>
        </Button>
      </div>
    </main>
  );
}
