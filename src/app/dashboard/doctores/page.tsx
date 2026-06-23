"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/infrastructure/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Plus,
  Search,
  Edit,
  Trash2,
  Stethoscope,
  ArrowLeft,
} from "lucide-react";

/**
 * Doctor list page — searchable, paginated table of doctors.
 *
 * Admin-only page for managing doctors.
 */
export default function DoctoresListPage() {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const LIMITE = 10;

  // Debounce search input
  const handleSearchChange = useCallback(
    (value: string) => {
      setBusqueda(value);
      const timer = setTimeout(() => {
        setDebouncedSearch(value);
        setPagina(1);
      }, 400);
      return () => clearTimeout(timer);
    },
    [],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = api.admin.listDoctores.useQuery(
    { busqueda: debouncedSearch || undefined, pagina, limite: LIMITE },
    { retry: 1 },
  );

  const deleteMutation = api.admin.deleteDoctor.useMutation({
    onSuccess: () => refetch(),
  });

  const handleDelete = async (doctorId: string, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar a ${nombre}?`)) return;
    try {
      await deleteMutation.mutateAsync({ doctorId, tipo: "soft" });
    } catch {
      // Error handled by tRPC
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Doctores</h1>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Doctores</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error al cargar doctores</AlertTitle>
          <AlertDescription>
            {error?.message ?? "Ha ocurrido un error inesperado"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const doctores = data?.doctores ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = data?.totalPaginas ?? 0;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Doctores</h1>
        <Button asChild>
          <Link href="/dashboard/doctores/nuevo">
            <Plus className="mr-2 size-4" />
            Nuevo doctor
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o especialidad..."
          value={busqueda}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Empty state */}
      {doctores.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <Stethoscope className="size-12 text-muted-foreground" />
          <p className="text-center text-muted-foreground">
            {debouncedSearch
              ? "No se encontraron médicos con ese criterio de búsqueda."
              : "No hay doctores registrados."}
          </p>
          {!debouncedSearch && (
            <Button asChild variant="outline">
              <Link href="/dashboard/doctores/nuevo">
                <Plus className="mr-2 size-4" />
                Añadir primer doctor
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Especialidad</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doctores.map((doctor) => (
                  <TableRow key={doctor.id}>
                    <TableCell className="font-medium">
                      {doctor.nombre}
                    </TableCell>
                    <TableCell>{doctor.email}</TableCell>
                    <TableCell>{doctor.especialidad}</TableCell>
                    <TableCell>
                      {doctor.precioConsulta != null
                        ? `${Number(doctor.precioConsulta).toFixed(2)} €`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          doctor.activo ? "default" : "secondary"
                        }
                      >
                        {doctor.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <Link
                            href={`/dashboard/doctores/${doctor.id}`}
                          >
                            <Edit className="size-4" />
                            <span className="sr-only">Editar</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDelete(doctor.id, doctor.nombre)
                          }
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4 text-destructive" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando página {pagina} de {totalPaginas} ({total} doctores)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
