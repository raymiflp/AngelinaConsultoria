# Profiles UI Specification

## Purpose

Profile pages for authenticated users (view/edit at `/perfil`) and public doctor detail pages (`/doctores/[id]`), built with shadcn Card, Input, Textarea, Select, Badge, and Form components.

## Requirements

### Requirement: /perfil Page

The system SHALL render the authenticated user's profile in view mode with an edit toggle. Displayed fields SHALL vary by role.

#### Scenario: Doctor views own profile

- GIVEN an authenticated DOCTOR on `/perfil`
- WHEN the page loads successfully
- THEN it SHALL display Usuario fields AND Doctor fields (especialidad, biografia, precioConsulta)

#### Scenario: Patient views own profile

- GIVEN an authenticated PACIENTE on `/perfil`
- WHEN the page loads successfully
- THEN it SHALL display Usuario fields AND Paciente fields (fechaNacimiento, direccion, alergias, grupoSanguineo, notasMedicas)

#### Scenario: Loading state

- GIVEN a user on `/perfil`
- WHEN getMyProfile is in flight
- THEN the page SHALL render Skeleton placeholders for all profile fields

#### Scenario: API error state

- GIVEN a user on `/perfil`
- WHEN getMyProfile fails (network or server error)
- THEN the page SHALL display an Alert with the error message and a retry button

#### Scenario: Empty profile state

- GIVEN an authenticated user with no Doctor or Paciente record
- WHEN they visit `/perfil`
- THEN the page SHALL display an Empty state with a "Crear perfil" prompt (link to profile creation)

### Requirement: Profile Edit Form

The system SHALL render an editable form when the user toggles edit mode, using shadcn Form validation patterns and role-appropriate fields.

#### Scenario: Toggle to edit mode

- GIVEN a user viewing their profile on `/perfil`
- WHEN they click the edit button
- THEN the view SHALL switch to edit mode with fields pre-populated from profile data

#### Scenario: Cancel reverts changes

- GIVEN a user in edit mode with modified fields
- WHEN they click cancel
- THEN the form SHALL reset to view mode without persisting any changes

#### Scenario: Successful update

- GIVEN a user in edit mode with valid fields
- WHEN they submit the form
- THEN the system SHALL call updateMyProfile, show a success toast via sonner, and invalidate the profile query cache

#### Scenario: Validation error on submit

- GIVEN a user in edit mode
- WHEN they submit with invalid data (e.g. empty especialidad for a doctor)
- THEN the form SHALL display inline field-level validation errors without calling the API

### Requirement: /doctores/[id] Page

The system SHALL render a multi-section public doctor profile page accessible without authentication. The page SHALL display a Hero section with doctor metadata, an Experience section with education/work history, a Services section with active services and pricing, and a Conditions section with treated conditions as tags. Data SHALL be fetched via the `getDoctorFullProfile` tRPC procedure.

#### Scenario: Multi-section layout renders

- GIVEN a valid doctor with complete data
- WHEN any user navigates to `/doctores/[id]`
- THEN the page SHALL display in order:
  1. Back link ("Volver a la lista" → `/doctores`)
  2. DoctorHero section (Avatar with photo/initials, name, specialty, location, license number, years of experience, languages, rating, phone, CTA buttons)
  3. DoctorExperience section (education + work timeline with icons and date ranges)
  4. DoctorServices section (active service cards with name, description, price €, duration)
  5. DoctorConditions section (condition tags as a wrapping flex container of Badge components)
- AND sections MUST be separated by consistent vertical spacing (e.g., `space-y-8`)

#### Scenario: Doctor not found

- GIVEN a non-existent doctorId
- WHEN a user navigates to `/doctores/[id]`
- THEN the page SHALL display an Alert (variant="destructive") with "Doctor no encontrado" and a "Volver" button

#### Scenario: Loading state

- GIVEN a user navigating to `/doctores/[id]`
- WHEN `getDoctorFullProfile` is in flight
- THEN the page SHALL render a `DoctorProfileSkeleton` with skeleton shapes for: Hero section (avatar circle, text lines, button rectangles), Experience section (timeline-like shapes), Services section (card-like shapes), and Conditions section (small rounded rectangles in wrapping layout)

#### Scenario: Network error

- GIVEN the query fails with a network/server error
- WHEN the page renders
- THEN the page SHALL display an Alert with the error message and a "Volver" button

#### Scenario: Hero missing fields hidden gracefully

- GIVEN a doctor with null location, null experience, no languages, null phone
- WHEN `DoctorHero` renders
- THEN the missing fields MUST NOT render at all (no empty labels, no broken layout)

#### Scenario: CTA visibility for unauthenticated users

- GIVEN an unauthenticated user
- WHEN `DoctorHero` renders
- THEN the "Reservar cita" button MUST be visible and navigable
- AND the "Llamar" and "Mensaje" buttons MUST be visible

#### Scenario: CTA visibility for authenticated patients

- GIVEN an authenticated PACIENTE
- WHEN `DoctorHero` renders
- THEN all three CTA buttons MUST be visible
- AND "Reservar cita" MUST link to `/doctores/{id}/agendar`

#### Scenario: CTA visibility for doctors/admins

- GIVEN an authenticated user with rol=DOCTOR or rol=ADMIN
- WHEN `DoctorHero` renders
- THEN the "Reservar cita" button SHOULD be hidden
- AND "Llamar" and "Mensaje" buttons MAY render (visual only)

### Requirement: Shared Components

Profile components SHALL use shadcn primitives following the project's established composition patterns.

#### Scenario: Specialty as Select

- GIVEN a DOCTOR user in edit mode
- WHEN the especialidad field renders
- THEN it SHALL use a Select component pre-populated with available specialty options

#### Scenario: Price as Badge

- GIVEN any profile view showing precioConsulta
- WHEN the value is displayed
- THEN it SHALL use the Badge component with currency formatting

## Modality Toggle Additions (2026-06-19)

The following requirements are ADDED to the profiles-ui spec by the `2026-06-19-modality-toggle` change. Three UI surfaces are affected: (1) a new "Disponible online" badge on `DoctorHero` so patients can see which doctors offer online consultations at a glance; (2) a new "Disponible online" filter pill on the `/doctores` listing page so patients can filter the list down to online-capable doctors; (3) the toggle in `/configuracion` is covered by `doctor-settings-ui/spec.md` (the dedicated spec for that surface) — this spec only forwards to it. The badge and the pill are two independent additions; either can be removed in a follow-up without affecting the other.

### Requirement: REQ-PU-MOD-1 — "Disponible online" badge on DoctorHero

The existing `DoctorHero` component (`src/components/profiles/DoctorHero.tsx`) MUST render a new `<Badge>` next to the existing rating badge when `doctor.aceptaOnline === true`. The badge MUST read exactly `"Disponible online"` (Spanish, exactly as written — no "Online", no "Ofrece online", no "Videollamada disponible", no abbreviation). The badge MUST include a `Video` icon from `lucide-react` placed to the left of the text (the icon is part of the badge, not a separate element). The badge MUST be placed in the same visual region as the rating badge (the metadata row in the hero), with consistent vertical alignment.

The badge MUST be hidden (rendered as `null`, NOT a disabled empty badge) when `doctor.aceptaOnline === false` (a doctor who has not opted in MUST NOT advertise online consultations). The badge MUST be hidden when the field is `undefined` (defensive — older `getDoctorFullProfile` responses without the field MUST NOT render a misleading badge). The `tel:` "Llamar" button MUST remain visible regardless of `aceptaOnline` (per AD-8 in the proposal — a doctor who has explicitly set `telefonoConsulta` keeps the phone button even after opting into online; the badge is additive, not a replacement).

#### Scenario: Doctor with online enabled shows the badge

- GIVEN a doctor with `aceptaOnline === true`
- WHEN `DoctorHero` renders
- THEN a `<Badge>` with the text `"Disponible online"` MUST be in the DOM
- AND the badge MUST include a `Video` icon from `lucide-react` to the left of the text
- AND the badge MUST be placed in the hero's metadata row (the same row as the rating badge)

#### Scenario: Doctor with online disabled does not show the badge

- GIVEN a doctor with `aceptaOnline === false`
- WHEN `DoctorHero` renders
- THEN the `"Disponible online"` badge MUST NOT be in the DOM
- AND no empty placeholder, no "Online" text, no disabled state of the badge MUST be visible

#### Scenario: Field missing (defensive) does not show the badge

- GIVEN a `getDoctorFullProfile` response that does not include `aceptaOnline` (e.g. an older client or a future regression)
- WHEN `DoctorHero` renders
- THEN the badge MUST NOT be in the DOM (the `=== true` check MUST be strict, not truthy)

#### Scenario: Tel button remains visible

- GIVEN a doctor with `aceptaOnline === true` AND `telefonoConsulta` set
- WHEN `DoctorHero` renders
- THEN BOTH the `"Disponible online"` badge AND the `tel:` "Llamar" button MUST be in the DOM
- AND removing the badge in a follow-up MUST NOT affect the `tel:` button (they are independent)

### Requirement: REQ-PU-MOD-2 — "Disponible online" filter pill on /doctores

The existing `/doctores` listing page (`src/app/doctores/page.tsx`) MUST render a new clickable `<Badge variant="outline">` pill next to the existing search input. The pill MUST read exactly `"Disponible online"` (Spanish, exactly as written — same casing as the hero badge for consistency). The pill MUST be a client component (it toggles URL state) and MUST be placed visually next to the search input (not inside a dropdown, not in a sidebar).

The pill MUST be wired to URL state via `useSearchParams()` and `useRouter().replace()`: when the URL contains the param `?aceptaOnline=true`, the pill MUST render in the filled / "active" state (e.g. `variant="default"` or `bg-primary text-primary-foreground`) AND the page MUST pass `aceptaOnline: true` to `listDoctorProfiles` (see `profiles-api/spec.md` REQ-PA-MOD-4). When the URL does NOT contain the param, the pill MUST render in the outline / "inactive" state AND the page MUST NOT pass the `aceptaOnline` field to the query (so the filter is undefined = no filter = all doctors).

Clicking the pill MUST toggle the URL state: clicking the inactive pill MUST add `?aceptaOnline=true` to the URL via `router.replace()` (preserving any other search params); clicking the active pill MUST remove the param. The toggle MUST be a single click — no confirmation dialog, no two-step flow. The URL MUST be the source of truth: a page reload (e.g. paste a link with `?aceptaOnline=true` into the address bar) MUST show the pill in the active state and apply the filter.

#### Scenario: Inactive pill renders in outline state

- GIVEN the user is on `/doctores` with no `?aceptaOnline=true` in the URL
- WHEN the page renders
- THEN a `<Badge variant="outline">` with the text `"Disponible online"` MUST be in the DOM
- AND the pill MUST be placed next to the existing search input
- AND the page MUST call `listDoctorProfiles` WITHOUT the `aceptaOnline` field (the filter is not applied)
- AND all doctors MUST be in the response (no filter)

#### Scenario: Clicking the inactive pill activates the filter

- GIVEN the user is on `/doctores` with the pill inactive
- WHEN the user clicks the pill
- THEN the URL MUST be updated to `/doctores?aceptaOnline=true` via `router.replace()`
- AND the pill MUST re-render in the active state (filled / `variant="default"`)
- AND the page MUST call `listDoctorProfiles` with `aceptaOnline: true`
- AND only online-capable doctors MUST be in the response

#### Scenario: Clicking the active pill deactivates the filter

- GIVEN the user is on `/doctores?aceptaOnline=true`
- WHEN the user clicks the active pill
- THEN the URL MUST be updated to `/doctores` (the param removed) via `router.replace()`
- AND the pill MUST re-render in the inactive state
- AND the page MUST call `listDoctorProfiles` WITHOUT the `aceptaOnline` field
- AND all doctors MUST be in the response

#### Scenario: URL-driven state survives a page reload

- GIVEN the user pastes `https://.../doctores?aceptaOnline=true` into the address bar
- WHEN the page loads
- THEN the pill MUST render in the active state on first paint
- AND the page MUST call `listDoctorProfiles` with `aceptaOnline: true` on the first query
- AND the active state MUST be derived from `useSearchParams()`, NOT from a `useState` hook (a page reload must work)

#### Scenario: Other search params are preserved on toggle

- GIVEN the user is on `/doctores?search=cardiologo` (any other valid param)
- WHEN the user clicks the inactive pill
- THEN the URL MUST be updated to `/doctores?search=cardiologo&aceptaOnline=true` (the existing param MUST be preserved, not overwritten)

## Cross-References

The new "Modalidad de consulta" toggle card in `/configuracion` (the doctor-side opt-in / opt-out surface) is documented in `doctor-settings-ui/spec.md` (its own dedicated spec). The toggle writes `doctor.aceptaOnline` via `profiles.updateAcceptsOnline` (`booking-api/spec.md` REQ-BA-MOD-4); the badge on `DoctorHero` reads the same field via `getDoctorFullProfile` (`profiles-api/spec.md` REQ-PA-MOD-2, rendered per REQ-PU-MOD-1 above); the listing pill on `/doctores` uses the filter on `listDoctorProfiles` (`profiles-api/spec.md` REQ-PA-MOD-3, rendered per REQ-PU-MOD-2 above). Together, the five specs describe the end-to-end flow: doctor toggles in `/configuracion` → patients see the badge and the listing filter → the `createAppointment` gate (`booking-api/spec.md` REQ-BA-MOD-2) honors the toggle.
