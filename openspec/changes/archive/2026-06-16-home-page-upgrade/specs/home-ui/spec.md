# Home Page UI Specification

## Purpose

Define the upgrade of the public landing page at `/` (`src/app/page.tsx`) from a 34-line skeleton (one H1, one paragraph, three links) to a six-section marketing page modeled on Doctoralia. The page is the patient's first impression; it SHALL communicate what MedicoConsulta is, surface a one-click path to a doctor, and signal trust through verified-doctor counts. The change is purely presentational and depends on one new tRPC procedure (`getHomeStats`) — no schema changes are introduced.

## Requirements

### Requirement: Page Structure and Composition

The home page at `/` SHALL render six distinct sections in this vertical order, separated by consistent vertical rhythm (e.g. `space-y-16` or `py-16` section blocks):

1. `HomeNav` (sticky top bar)
2. `Hero` (headline + sub-headline + `HeroSearchForm` + `TrustCounter`)
3. `SpecialtyPills` (horizontal row of 12 badges + "Ver más" link)
4. `FeaturedDoctors` (heading + grid of up to 8 `DoctorCard`s + "Ver todos" link)
5. `ValueProps` (4-card grid)
6. `Footer` (4-column footer + copyright bar)

Each section SHALL be its own component file under `src/components/home/`. The home page SHALL be a React Server Component (RSC) composed of those section components; only `HeroSearchForm`, `FeaturedDoctors`, and the auth-aware portion of `HomeNav` SHALL be client islands.

The home page SHALL NOT use the `Shell` layout (`src/components/Shell.tsx`) — that layout is reserved for authenticated routes. The home SHALL use the new `HomeNav` + `Footer` pair as its public-only chrome.

The home page file (`src/app/page.tsx`) SHALL match the root layout's rendering mode: it SHALL be declared `export const dynamic = "force-dynamic"` (matching `src/app/layout.tsx`) so the trust counter and featured grid see fresh data on every request.

#### Scenario: Sections render in the documented vertical order

- GIVEN the home page `/` is requested by an anonymous visitor
- WHEN the page resolves
- THEN the DOM top-to-bottom MUST contain: `HomeNav` first, `Hero` second, `SpecialtyPills` third, `FeaturedDoctors` fourth, `ValueProps` fifth, `Footer` sixth
- AND no other public-only chrome (sidebar, dashboard header) SHALL appear

#### Scenario: Home page does not import Shell

- GIVEN the home page is rendered
- WHEN inspecting the source of `src/app/page.tsx`
- THEN it MUST NOT import `Shell` from `@/components/Shell`
- AND the visible chrome MUST be `HomeNav` (top) + `Footer` (bottom) only

#### Scenario: Force-dynamic matches root layout

- GIVEN the root layout declares `force-dynamic`
- WHEN `src/app/page.tsx` is read
- THEN it SHALL also declare `export const dynamic = "force-dynamic"`
- AND no static-rendering hints (`revalidate`, `dynamicParams`) SHALL be added in this change

### Requirement: HomeNav Component

The `HomeNav` component (`src/components/home/HomeNav.tsx`) SHALL render a sticky top bar with: a brand logo (text-only, "MedicoConsulta", linking to `/`), and right-aligned actions. The bar SHALL use a frosted-glass background: `bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80`.

The right-aligned actions SHALL depend on auth state, read via `useSession()` from `next-auth/react`:

- **Anonymous state**: render "Iniciar sesión" (text link → `/login`), "Registrarse" (primary `Button` → `/registro`).
- **Authenticated state**: render the existing `UserMenu` (`src/components/UserMenu.tsx`) in place of the two auth links.

The component SHALL be a client component (requires `useSession`).

The mobile layout (`<768px`) SHALL collapse the right-aligned actions into a single hamburger button that opens a shadcn `Sheet` containing the same actions. The `Sheet` content SHALL preserve the same destination links as the desktop variant.

#### Scenario: Anonymous top bar

- GIVEN an anonymous visitor lands on `/`
- WHEN `HomeNav` renders
- THEN it MUST display "MedicoConsulta" on the left
- AND it MUST display "Iniciar sesión" linking to `/login`
- AND it MUST display "Registrarse" rendered as a `Button variant="default"` linking to `/registro`
- AND the `UserMenu` MUST NOT be in the DOM

#### Scenario: Authenticated top bar

- GIVEN a user with an active session visits `/`
- WHEN `HomeNav` renders
- THEN the "Iniciar sesión" and "Registrarse" controls MUST NOT be in the DOM
- AND the existing `UserMenu` component MUST be rendered in their place

#### Scenario: Frosted-glass background

- GIVEN `HomeNav` is rendered
- WHEN the rendered HTML is inspected
- THEN the top bar's root element MUST include the class list `bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80`

#### Scenario: Sticky positioning

- GIVEN `HomeNav` is rendered
- WHEN the user scrolls the page
- THEN the top bar MUST remain visible at the top of the viewport (sticky positioning)

#### Scenario: Mobile sheet collapse

- GIVEN the viewport is narrower than 768px
- WHEN the user taps the hamburger button
- THEN a shadcn `Sheet` SHALL open with the same auth actions and destination links as the desktop variant
- AND closing the sheet MUST return focus to the hamburger trigger

### Requirement: Hero Section

The `Hero` section SHALL render a centered headline and sub-headline followed by the `HeroSearchForm` and (when applicable) the `TrustCounter`.

- The `<h1>` text SHALL be exactly: **"Encuentra tu especialista y pide cita"**.
- The `<p>` sub-headline SHALL be: **"Tu plataforma de salud digital para conectar pacientes con doctores."** (or a short equivalent; kept under 120 characters).
- The `HeroSearchForm` SHALL be a client component (`src/components/home/HeroSearchForm.tsx`) rendering:
  - A specialty `Input` with `placeholder="Especialidad, enfermedad o nombre"` (functional).
  - A city `Input` with `placeholder="Ciudad (próximamente)"`, `disabled`, `aria-label="Próximamente"`, `title="Próximamente"` (decorative in v1).
  - A "Buscar" `Button` with `type="submit"` and primary variant.
- On form submit, the component SHALL call `useRouter().push("/doctores?especialidad=" + encodeURIComponent(rawValue))` with the trimmed specialty value. The submit handler SHALL NOT call the city field.
- The `TrustCounter` SHALL display the string `"{N} doctores verificados"` where `N = getHomeStats().totalVerifiedDoctors`. The `TrustCounter` SHALL be rendered **only** when `N > 0`; when `N === 0` it MUST return `null` and MUST NOT be in the DOM. This zero-state fallback is a hard requirement (it preserves first-impression trust on empty databases, fresh deploys, and test environments).

#### Scenario: Headline and sub-headline render

- GIVEN the home page is loaded
- WHEN the `Hero` renders
- THEN a single `<h1>` with the exact text "Encuentra tu especialista y pide cita" MUST be present
- AND a `<p>` with the sub-headline MUST be present immediately below the `<h1>`

#### Scenario: Hero search form structure

- GIVEN `HeroSearchForm` is rendered
- WHEN the DOM is inspected
- THEN it MUST contain a specialty `Input` (not disabled, with the documented placeholder)
- AND it MUST contain a city `Input` (disabled, with `aria-label="Próximamente"` and `title="Próximamente"`)
- AND it MUST contain a submit `Button` labeled "Buscar"

#### Scenario: Submit navigates with URL-encoded specialty

- GIVEN the user types "Psicólogo" in the specialty input
- AND clicks the "Buscar" button
- WHEN the form submits
- THEN the router MUST navigate to `/doctores?especialidad=Psic%C3%B3logo` (URL-encoded)
- AND the city field's value MUST be ignored

#### Scenario: Empty submit does not navigate

- GIVEN the specialty input is empty
- WHEN the user clicks "Buscar"
- THEN the form MUST NOT navigate (the handler MUST short-circuit on empty/blank values)
- AND no tRPC request SHALL be triggered

#### Scenario: TrustCounter hidden at zero verified doctors

- GIVEN `getHomeStats().totalVerifiedDoctors === 0`
- WHEN the `Hero` renders
- THEN the `TrustCounter` MUST NOT be present in the DOM (returns `null`)
- AND no "0 doctores verificados" text SHALL appear

#### Scenario: TrustCounter renders when N > 0

- GIVEN `getHomeStats().totalVerifiedDoctors === 5`
- WHEN the `Hero` renders
- THEN a `TrustCounter` element MUST be present in the DOM
- AND its text MUST include "5 doctores verificados" (the exact number)

### Requirement: SpecialtyPills Section

The `SpecialtyPills` section (`src/components/home/SpecialtyPills.tsx`) SHALL render a horizontal row of clickable pills (shadcn `Badge` with hover treatment) linking to `/doctores?especialidad={slug}`. The list of pills SHALL be the 12 entries from `POPULAR_SPECIALTIES` in `src/lib/constants/specialties.ts` (REQ-SPEC-CONST-1). The order of pills MUST be the order of the constant.

The row SHALL include a 13th element: a "Ver más" `Button variant="link"` (or styled text link) linking to `/doctores`.

On viewports narrower than 768px, the row SHALL horizontally scroll (`overflow-x-auto`) and MUST NOT wrap. On viewports ≥ 768px, the row SHALL fit on a single line if width allows, with `flex-wrap` permitted as a graceful fallback.

#### Scenario: 12 pills + "Ver más" link

- GIVEN the home page is loaded
- WHEN `SpecialtyPills` renders
- THEN it MUST render 12 `Badge` elements plus 1 "Ver más" link/button
- AND each pill MUST render a link to `/doctores?especialidad={slug}` where `{slug}` is the matching entry from `POPULAR_SPECIALTIES`
- AND the 13th element MUST link to `/doctores`

#### Scenario: Pill order matches constant

- GIVEN the home page is loaded
- WHEN the rendered pill list is inspected
- THEN the order of pills MUST match the order of `POPULAR_SPECIALTIES` exactly (Psicólogo first, Alergólogo last)

#### Scenario: Mobile horizontal scroll, no wrap

- GIVEN the viewport is narrower than 768px
- WHEN `SpecialtyPills` renders
- THEN its container MUST have `overflow-x-auto` and MUST NOT have `flex-wrap`
- AND the user MUST be able to swipe-scroll the pill row horizontally

#### Scenario: Pill click navigates to filtered listing

- GIVEN the user clicks the "Psicólogo" pill
- WHEN the click event resolves
- THEN the browser MUST navigate to `/doctores?especialidad=psicologo`
- AND the listing page MUST receive the `especialidad` query param (no other navigation MUST occur)

### Requirement: FeaturedDoctors Section

The `FeaturedDoctors` section (`src/components/home/FeaturedDoctors.tsx`) SHALL render an `<h2>` with the exact text **"Doctores destacados"** followed by a responsive grid of doctor cards.

The component SHALL fetch data via the existing public tRPC procedure `listDoctorProfiles` with `{ limit: 8 }`. The import SHALL be `import { api } from "@/infrastructure/api"`; the call SHALL be `api.profiles.listDoctorProfiles.useQuery({ limit: 8 })`.

The grid layout SHALL be:

- 1 column on `<sm` (mobile)
- 2 columns on `sm` to `<lg` (tablet)
- 3 columns on `lg` to `<xl` (desktop)
- 4 columns on `xl` and wider (large desktop)

Each doctor SHALL be rendered with the existing `DoctorCard` component (`src/components/profiles/DoctorCard.tsx`) wrapped in a `Link` to `/doctores/{doctor.id}`. The `showBookingLink` prop on `DoctorCard` SHALL be `false` (the parent `Link` already navigates).

The section SHALL include a "Ver todos los doctores" `Button variant="link"` at the bottom linking to `/doctores`.

#### Scenario: Loading state shows skeleton grid

- GIVEN `listDoctorProfiles` is in flight
- WHEN `FeaturedDoctors` renders
- THEN the grid MUST render 8 `Card` placeholders whose content is a `Skeleton` for: avatar circle, title line, subtitle lines, footer line
- AND no empty/error text SHALL be in the DOM
- AND the "Ver todos los doctores" link MAY be present but is not required during loading

#### Scenario: Empty state shows the empty message

- GIVEN `listDoctorProfiles` resolves to an empty array `[]`
- WHEN `FeaturedDoctors` renders
- THEN a single centered `<p>` with the text "No hay doctores disponibles por el momento." MUST be in the DOM
- AND no `DoctorCard` SHALL be in the DOM
- AND the "Ver todos los doctores" link MAY be hidden in this state

#### Scenario: Error state shows retry control

- GIVEN `listDoctorProfiles` rejects (network or server error)
- WHEN `FeaturedDoctors` renders
- THEN a polite error `<p>` MUST be in the DOM
- AND a "Reintentar" `Button` MUST be present whose click handler refetches the query
- AND no `DoctorCard` SHALL be in the DOM

#### Scenario: Doctors rendered in responsive grid

- GIVEN `listDoctorProfiles` resolves to 6 doctors
- WHEN `FeaturedDoctors` renders
- THEN the grid root MUST carry the responsive column classes `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- AND exactly 6 `DoctorCard` components MUST be present
- AND each card MUST be wrapped in a `Link` to `/doctores/{id}`
- AND each `DoctorCard` SHALL have `showBookingLink={false}`

#### Scenario: Heading and "Ver todos" link

- GIVEN `FeaturedDoctors` renders successfully with doctors
- WHEN the DOM is inspected
- THEN a single `<h2>` with the exact text "Doctores destacados" MUST be present
- AND a "Ver todos los doctores" `Button variant="link"` linking to `/doctores` MUST be present

### Requirement: ValueProps Section

The `ValueProps` section SHALL render a single section with an `<h2>` heading **"¿Por qué MedicoConsulta?"** (or equivalent Spanish headline) followed by 4 cards in a responsive grid:

- 1 column on `<sm` (mobile)
- 2 columns on `sm` to `<lg` (tablet)
- 4 columns on `lg` and wider (desktop)

Each card SHALL contain: a `lucide-react` icon at 24×24, a one-line title, and a one-to-two-line description. The 4 cards SHALL be (in this order, hard-coded):

1. Icon: `Search`. Title: **"Encuentra tu especialista"**. Description: **"Explora perfiles verificados y elige al profesional ideal."**
2. Icon: `CalendarCheck`. Title: **"Pide cita de forma fácil"**. Description: **"Reserva online sin necesidad de llamar."**
3. Icon: `Bell`. Title: **"Recordatorios automáticos"**. Description: **"Te avisamos antes de cada cita."**
4. Icon: `BadgeCheck`. Title: **"Profesionales verificados"**. Description: **"Todos los doctores pasan un proceso de verificación."**

The icons SHALL be imported from `lucide-react`. The copy SHALL be hard-coded constants inside the component file (no i18n table in v1).

#### Scenario: 4 cards in the documented order

- GIVEN the home page is loaded
- WHEN `ValueProps` renders
- THEN exactly 4 cards MUST be in the DOM
- AND they MUST appear in the order Search → CalendarCheck → Bell → BadgeCheck
- AND each card MUST contain one of the documented title/description pairs

#### Scenario: Lucide icons present

- GIVEN the home page is loaded
- WHEN the `ValueProps` DOM is inspected
- THEN each card MUST contain exactly one `lucide-react` SVG icon at 24×24 (`size={24}` or `h-6 w-6`)
- AND the icon SHALL be the first element in the card (above the title)

#### Scenario: Responsive grid columns

- GIVEN `ValueProps` renders
- WHEN the grid root is inspected
- THEN it MUST carry `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

### Requirement: Footer Component

The `Footer` component (`src/components/home/Footer.tsx`) SHALL render a 4-column grid (1 column on `<sm`, 2 columns on `sm` to `<lg`, 4 columns on `lg` and wider) plus a bottom bar.

The 4 columns SHALL be (in this order):

1. **"Servicio"** — links: Privacidad, Términos, Quiénes somos, Contacto.
2. **"Para pacientes"** — links: Especialidades, Doctores, Preguntas frecuentes.
3. **"Para profesionales"** — links: Activar perfil, Zona para profesionales, Centro de ayuda.
4. **"Contacto"** — brand name "MedicoConsulta" plus an address placeholder line.

The component file SHALL begin with a top-of-file comment block: `// TODO(home-page-upgrade): replace # links with real pages when available` — this is a single source of truth for the next change to scan.

Links targeting existing pages in this codebase (`/doctores`, `/`, `/login`, `/registro`) SHALL use the real `href`. Links targeting pages that do not exist SHALL use `href="#"` AND SHALL carry the attribute `data-todo="home-page-upgrade"` so the next change can find them with a one-line grep.

Below the columns, the `Footer` SHALL render a horizontal shadcn `Separator` and a bottom bar containing:

- The copyright string: **"© 2026 MedicoConsulta. Todos los derechos reservados."**
- A short disclaimer line (e.g. "Información orientativa. En caso de urgencia, contacta con los servicios de emergencia.").

The footer root SHALL have `bg-muted` to visually separate it from the rest of the page.

#### Scenario: 4 columns render in documented order

- GIVEN the home page is loaded
- WHEN `Footer` renders
- THEN 4 column headings MUST be present in the order: Servicio, Para pacientes, Para profesionales, Contacto
- AND each column MUST contain the documented number of links/items

#### Scenario: Real pages link to real paths

- GIVEN the `Footer` is rendered
- WHEN the link `href` attributes are inspected
- THEN any link whose target exists in the codebase (`/doctores`, `/`, `/login`, `/registro`) MUST have the real `href`
- AND any link whose target does NOT exist MUST have `href="#"` AND `data-todo="home-page-upgrade"`

#### Scenario: Top-of-file TODO comment is present

- GIVEN `src/components/home/Footer.tsx` is read
- WHEN the first 20 lines are inspected
- THEN the comment `// TODO(home-page-upgrade): replace # links with real pages when available` MUST appear in the file header

#### Scenario: Separator and bottom bar

- GIVEN the `Footer` renders
- WHEN the rendered HTML is inspected
- THEN a horizontal shadcn `Separator` MUST appear between the columns and the bottom bar
- AND the bottom bar MUST contain the exact copyright string "© 2026 MedicoConsulta. Todos los derechos reservados."
- AND the bottom bar MUST contain a short disclaimer line

#### Scenario: Footer background and responsive grid

- GIVEN the `Footer` renders
- WHEN the root element is inspected
- THEN it MUST include `bg-muted` in its class list
- AND its grid MUST carry `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

### Requirement: Accessibility

All sections SHALL meet WCAG AA on the project's default theme tokens.

- Every interactive element MUST be keyboard-navigable (tab order matches visual order; `Enter`/`Space` activate native or shadcn-default behavior).
- Every interactive element MUST have a visible focus ring (the project's default Tailwind `focus-visible:ring-*` or shadcn's built-in focus styles SHALL be retained; no `outline-none` without replacement).
- Every meaningful `lucide-react` icon MUST have `aria-hidden="true"` when paired with visible text, OR an `aria-label` when used as a standalone control.
- The hero's `<h1>`, each section's `<h2>`, and the form `<label>`s MUST render semantic markup (no skipped heading levels on the home page).
- Color contrast SHALL meet WCAG AA: the project uses the default shadcn theme tokens, which are AA-compliant out of the box; no custom colors that fail contrast are introduced in this change.

#### Scenario: Keyboard navigation reaches every interactive element

- GIVEN the home page is loaded
- WHEN a keyboard user presses `Tab` repeatedly
- THEN focus MUST reach: the brand link, the auth controls, the specialty input, the city input (disabled — skipped), the "Buscar" button, every pill, the "Ver más" link, every doctor card link, the "Ver todos" link, every value-prop card (decorative — no focus), and every footer link
- AND focus MUST be visible at every step

#### Scenario: Icons are accessible

- GIVEN a `lucide-react` icon is rendered inside a `Button` whose text already describes the action (e.g. "Buscar")
- WHEN the DOM is inspected
- THEN the icon MUST have `aria-hidden="true"`
- AND the `Button`'s accessible name MUST come from its visible text

#### Scenario: Heading hierarchy is sequential

- GIVEN the home page renders successfully
- WHEN the headings in the DOM are inspected
- THEN the page MUST contain exactly one `<h1>` (the hero headline)
- AND each section MUST contain exactly one `<h2>` ("Doctores destacados", etc.)
- AND no `<h3>` is required in v1 (sections are flat)
- AND no heading level is skipped

### Requirement: Performance and Server Boundaries

The home page SHALL be rendered with the minimum client-side JavaScript required for interactivity.

- The page (`src/app/page.tsx`) SHALL be a React Server Component (RSC). It MUST NOT carry the `"use client"` directive.
- `HomeNav` SHALL be a client component (requires `useSession`).
- `HeroSearchForm` SHALL be a client component (requires controlled inputs and `useRouter`).
- `FeaturedDoctors` MAY be a client component (uses `useQuery`); it MUST NOT be re-fetched on the server and the client unless React Query decides to deduplicate.
- `SpecialtyPills`, `ValueProps`, `Hero` (the static parts), and `Footer` SHALL be server components (no client JS shipped for them).
- Data fetching SHALL avoid waterfalls. The `FeaturedDoctors` query and `getHomeStats` call SHOULD be initiated in parallel from the server when possible (the design phase decides the exact `createCaller` vs `useQuery` split).
- Any image rendered on the home page (none in v1) SHALL use `next/image` — the rule is documented for the next change.
- The page SHALL NOT add a new client-side `useEffect` for data fetching (the `useQuery` in `FeaturedDoctors` is the only client fetch).

#### Scenario: Server component is the page

- GIVEN `src/app/page.tsx` is read
- WHEN the first non-comment line is inspected
- THEN the file MUST NOT contain a top-level `"use client"` directive

#### Scenario: Client islands are minimized

- GIVEN the home page is loaded
- WHEN the network panel is inspected
- THEN the client JS bundles shipped for the home page MUST include code for: `HomeNav`, `HeroSearchForm`, `FeaturedDoctors`
- AND they MUST NOT include code for `SpecialtyPills`, `ValueProps`, `Hero` (static), or `Footer` (those run on the server only)

#### Scenario: Force-dynamic allows fresh data per request

- GIVEN the home page is requested twice within 60 seconds
- WHEN a doctor is verified in the database between the two requests
- THEN the second request MUST see the updated `getHomeStats().totalVerifiedDoctors` value (no stale cache across requests)
