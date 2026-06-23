import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── Component ──────────────────────────────────────────────────────────

/**
 * DoctorProfileSkeleton — full-page skeleton matching the multi-section
 * layout of the doctor detail page.
 *
 * Sections:
 * - Hero: avatar circle, title/subtitle lines, detail lines, button rectangles
 * - Experience: timeline-like items (icon circle + text lines)
 * - Services: card-shaped skeletons
 * - Conditions: small rounded rectangles in a wrapping layout
 */
export function DoctorProfileSkeleton() {
  return (
    <div className="space-y-8">
      {/* ─── Hero skeleton ─────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start">
          {/* Avatar column */}
          <div className="flex flex-col items-center gap-3 md:items-start md:min-w-48">
            <Skeleton className="size-24 rounded-full md:size-32" />
            <div className="flex flex-col items-center gap-2 md:items-start">
              <Skeleton className="h-8 w-48 md:h-9 md:w-56" />
              <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
          </div>

          {/* Details column */}
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-36" />
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-36 rounded-md" />
              <Skeleton className="h-10 w-28 rounded-md" />
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Experience skeleton ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="h-6 w-32">
            <Skeleton className="h-6 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Services skeleton ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="h-6 w-32">
            <Skeleton className="h-6 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-9 w-24 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Conditions skeleton ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="h-6 w-44">
            <Skeleton className="h-6 w-44" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
