/**
 * TrustCounter — server-rendered stat strip for the public home page hero.
 *
 * Renders the documented "N doctores verificados" line plus an optional
 * "M especialidades" segment. When `totalVerifiedDoctors === 0` (empty seed,
 * fresh deploy, test env, or DB outage), the component returns `null` and
 * is NOT in the DOM — REQ-HOME-UI-3 hard requirement (D3 in the proposal).
 * "0 doctores verificados" on a public landing destroys first-impression
 * trust, so the entire section is hidden in that case.
 */
interface TrustCounterProps {
  totalVerifiedDoctors: number;
  totalSpecialties: number;
}

export function TrustCounter({
  totalVerifiedDoctors,
  totalSpecialties,
}: TrustCounterProps) {
  if (totalVerifiedDoctors === 0) return null;

  return (
    <p
      aria-live="polite"
      className="text-muted-foreground text-sm"
    >
      {totalVerifiedDoctors}{" "}
      {totalVerifiedDoctors === 1 ? "doctor verificado" : "doctores verificados"}
      {totalSpecialties > 0 && (
        <>
          {" · "}
          {totalSpecialties}{" "}
          {totalSpecialties === 1 ? "especialidad" : "especialidades"}
        </>
      )}
    </p>
  );
}
