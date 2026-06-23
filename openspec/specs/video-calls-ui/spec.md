# Video Calls UI Specification

## Purpose

Define the UI surface that exposes the in-platform video consultation to the doctor and patient. The change adds the call page at `/citas/[id]/llamada`, a `JoinCallButton` component that appears on the existing appointment detail page, and a known-limitation footer note. The UI is a thin wrapper over the `LiveKitRoom` + `VideoConference` components from `@livekit/components-react`; this spec covers the page states, the wrapper chrome, the join button visibility logic, and the integration with the existing detail page. It does NOT cover the procedure or the token (see `video-calls-api`) or the LiveKit runtime (see `livekit-infrastructure`).

## Requirements

### Requirement: Call Page

The system MUST render a call page at `src/app/citas/[id]/llamada/page.tsx`. The page MUST be a client component (declared with `"use client"` at the top of the file). The page MUST read the `citaId` route parameter via `useParams()` (Next.js client hook, NOT `useParams` from react-router).

The page MUST call `api.bookings.getRoomToken.useQuery({ citaId }, { enabled: !!session, retry: 1 })`. The `enabled` flag prevents a request firing before the session resolves. `retry: 1` allows one automatic retry on transient errors (e.g. a flaky first WebSocket handshake) before surfacing the error UI.

The page MUST render exactly three states:

1. **Loading**: a `Spinner` (or Tailwind `animate-pulse` placeholder) plus the text `"Conectando con la sala…"`.
2. **Error**: a `<p role="alert">` with the error message in Spanish, a `"Reintentar"` `Button` that calls `refetch()`, and a `"Volver"` link to `/citas/[id]`.
3. **Success**: a `<LiveKitRoom>` with the `<VideoConference>` component inside (see the next requirement).

#### Scenario: Loading state shows the spinner and message

- GIVEN the `getRoomToken` query is in flight
- WHEN the page renders
- THEN a `Spinner` MUST be visible
- AND the text `"Conectando con la sala…"` MUST be in the DOM
- AND no `<LiveKitRoom>` SHALL be in the DOM yet

#### Scenario: Error state shows retry and back controls

- GIVEN the `getRoomToken` query rejects
- WHEN the page renders
- THEN an error message in a `<p role="alert">` MUST be in the DOM
- AND a `"Reintentar"` `Button` MUST be present, whose click handler calls `refetch()`
- AND a `"Volver"` link to `/citas/${citaId}` MUST be present

#### Scenario: Success state mounts LiveKitRoom

- GIVEN the `getRoomToken` query returns `{ token, serverUrl, roomName }`
- WHEN the page renders
- THEN a `<LiveKitRoom>` MUST be in the DOM
- AND `<VideoConference>` MUST be rendered inside it
- AND no loading spinner or error text SHALL be in the DOM

#### Scenario: Unauthenticated session prevents the query

- GIVEN the user is not signed in
- WHEN the page renders
- THEN the `useQuery` MUST NOT fire (`enabled: false`)
- AND the page SHALL render the loading state (waiting for session)
- AND no `UNAUTHORIZED` error SHALL be displayed (the page is auth-gated upstream by the route group)

### Requirement: LiveKitRoom Configuration

The `<LiveKitRoom>` element MUST be configured with these exact props:

- `serverUrl={data.serverUrl}` — the URL from the token query
- `token={data.token}` — the JWT from the token query
- `connect={true}` — auto-connect on mount
- `video={true}` — request camera
- `audio={true}` — request microphone
- `onDisconnected={() => router.push(\`/citas/${citaId}\`)}` — navigate back to the detail page when the room disconnects

`connect={true}` is intentional: the user lands on the page, the token is fetched, and the room joins immediately. There is no "Join" button on the call page — the gate is upstream on the detail page (see `JoinCallButton` visibility).

#### Scenario: LiveKitRoom receives the token and serverUrl

- GIVEN the query returns `{ token: "jwt", serverUrl: "ws://localhost:7880", roomName: "cita-x" }`
- WHEN the page renders
- THEN `<LiveKitRoom>` MUST be mounted with `serverUrl="ws://localhost:7880"` AND `token="jwt"`

#### Scenario: Leave button navigates back

- GIVEN a user is connected to the room
- WHEN the user clicks the LiveKit "Leave" control (or the room is otherwise disconnected)
- THEN the `onDisconnected` callback MUST fire
- AND the router MUST navigate to `/citas/${citaId}`
- AND the call page MUST unmount

#### Scenario: Camera and microphone are requested

- GIVEN the `<LiveKitRoom>` mounts
- WHEN the browser prompts for media permissions
- THEN the prompt MUST include both camera and microphone (because `video={true}` and `audio={true}`)

### Requirement: Top Bar

The call page MUST render a top bar above the `<LiveKitRoom>`. The top bar MUST contain:

- A `"Volver"` text link (or `Button variant="ghost"`) navigating to `/citas/${citaId}`
- A small status indicator: a pulsing red dot (Tailwind `animate-pulse` + `bg-red-500`) next to the text `"En vivo"`
- A cita summary: the `fechaHora` formatted in Spanish, e.g. `"15 jun 2026, 14:30"`

The top bar MUST be sticky at the top of the page (`sticky top-0 z-10` or equivalent). The sticky positioning ensures the user always sees the disconnect/back control, even if the LiveKit tile grid scrolls.

#### Scenario: Top bar shows the back link and live badge

- GIVEN the call page is in the success state
- WHEN the top bar renders
- THEN a `"Volver"` link to `/citas/${citaId}` MUST be present
- AND a status indicator with the text `"En vivo"` and a red pulsing dot MUST be present

#### Scenario: Cita summary is rendered in Spanish

- GIVEN the cita's `fechaHora` is `2026-06-15T14:30:00Z`
- WHEN the top bar renders
- THEN the formatted date MUST be in Spanish (`"15 jun 2026"` or equivalent) and MUST include the time

#### Scenario: Top bar is sticky

- GIVEN the call page is rendered
- WHEN the user scrolls down the page
- THEN the top bar MUST remain visible at the top of the viewport
- AND it MUST NOT scroll out of view

### Requirement: JoinCallButton Component

A new component `JoinCallButton` MUST be created at `src/components/booking/JoinCallButton.tsx`. The component MUST be a client component (it uses `useRouter` for navigation). The component MUST accept the following props (all required):

```ts
{
  citaId: string;
  estado: ConsultationStatus;
  fechaHora: Date;
  isDoctor: boolean;
}
```

The `isDoctor` prop is for future-proofing (D7 commits to a single label, but the prop exists so the call site can later render different copy per role without refactoring the component).

The button MUST be visible (rendered to the DOM) when ONE of these conditions is true:

- `estado === 'EN_CURSO'`, OR
- `estado === 'CONFIRMADA' AND Math.abs(Date.now() - fechaHora.getTime()) <= 15 * 60 * 1000`

The button MUST be hidden (rendered as `null`) otherwise. Hiding (not disabling) is the right behavior because the button is a navigation control, not a form submit — a disabled button would invite confusion.

The button MUST render a `Button` (shadcn) with a `Video` icon from `lucide-react` and the label `"Unirse a la videollamada"`. On click, the button MUST call `router.push(\`/citas/${citaId}/llamada\`)`.

#### Scenario: EN_CURSO cita shows the button

- GIVEN a cita with `estado === 'EN_CURSO'`
- WHEN `JoinCallButton` renders
- THEN the button MUST be in the DOM
- AND it MUST display a `Video` icon and the text `"Unirse a la videollamada"`

#### Scenario: CONFIRMADA cita within the ±15 min window shows the button

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 5 minutes in the future
- WHEN `JoinCallButton` renders
- THEN the button MUST be in the DOM

#### Scenario: CONFIRMADA cita 10 minutes in the past shows the button (symmetric window)

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 10 minutes in the past
- WHEN `JoinCallButton` renders
- THEN the button MUST be in the DOM (the symmetric `Math.abs(...)` window covers late joiners)

#### Scenario: PENDIENTE cita hides the button

- GIVEN a cita with `estado === 'PENDIENTE'`
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM (the component returns `null`)

#### Scenario: CONFIRMADA cita 30 minutes in the future hides the button

- GIVEN a cita with `estado === 'CONFIRMADA'` and `fechaHora` 30 minutes in the future
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM

#### Scenario: COMPLETADA cita hides the button

- GIVEN a cita with `estado === 'COMPLETADA'`
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM

#### Scenario: CANCELADA and NO_ASISTIO hide the button

- GIVEN a cita with `estado === 'CANCELADA'` (and separately `NO_ASISTIO`)
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM

#### Scenario: Click navigates to the call page

- GIVEN the button is visible
- WHEN the user clicks it
- THEN the router MUST navigate to `/citas/${citaId}/llamada`

### Requirement: Detail Page Integration

The existing appointment detail page `src/app/citas/[id]/page.tsx` MUST include a `<JoinCallButton>` next to the existing action controls. The button MUST be placed:

- In the **same** card as the doctor actions (`Confirmar` / `Iniciar consulta` / `Completar`) for the DOCTOR view
- In a **separate** card (or in the existing summary card) for the PACIENTE view — the patient has no transition buttons, so the join button gets its own affordance

The component MUST be mounted with the exact props:

```tsx
<JoinCallButton
  citaId={cita.id}
  estado={cita.estado}
  fechaHora={new Date(cita.fechaHora)}
  isDoctor={isDoctor}
/>
```

The `new Date(cita.fechaHora)` wrap converts the Drizzle `timestamp` to a JS `Date` (the cita entity exposes the raw value, and the button's prop type is `Date`).

The integration is additive: the existing detail page layout, action buttons, notes editor, and status badge MUST remain unchanged. The `JoinCallButton` is a single new element rendered conditionally on visibility.

#### Scenario: Doctor view places the button with the action card

- GIVEN a DOCTOR viewing a CONFIRMADA cita within the time window
- WHEN the detail page renders
- THEN a `<JoinCallButton>` MUST be present inside the doctor action card
- AND the existing `Confirmar` / `Iniciar consulta` buttons MUST remain in place

#### Scenario: Patient view places the button in a dedicated card

- GIVEN a PACIENTE viewing a CONFIRMADA cita within the time window
- WHEN the detail page renders
- THEN a `<JoinCallButton>` MUST be present in the patient area
- AND the doctor's transition buttons MUST NOT be in the DOM (role gating)

#### Scenario: Hidden button leaves no DOM residue

- GIVEN a cita whose state and time do not satisfy the visibility rule
- WHEN the detail page renders
- THEN `<JoinCallButton>` MUST render to `null` (no placeholder, no hidden div, no empty space)
- AND the detail page layout MUST be visually identical to the pre-change layout

### Requirement: Accessibility

All video-call UI MUST meet WCAG AA on the project's default theme tokens.

- The call page MUST be keyboard-navigable. Every interactive element (top-bar "Volver" link, LiveKit's built-in control bar buttons, error state's "Reintentar" button) MUST be reachable via `Tab` and MUST have a visible focus ring.
- Icon-only buttons MUST have an `aria-label`. Specifically: the top-bar "Volver" link, the "En vivo" status indicator's dot (decorative), and the `JoinCallButton`'s icon MUST be paired with text or `aria-label`.
- The `"En vivo"` status indicator MUST have `aria-live="polite"` so screen readers announce connection state changes.
- The error message MUST be in a `<p role="alert">` so it is announced when it appears.
- The "Conectando con la sala…" loading text MUST be the accessible name of the spinner (no `aria-hidden` on the spinner; the visible text describes the state).

#### Scenario: Keyboard navigation reaches every interactive element

- GIVEN the call page is in the success state
- WHEN a keyboard user presses `Tab` repeatedly
- THEN focus MUST reach: the top-bar "Volver" link, the LiveKit control bar buttons (mic, camera, leave, etc.)
- AND focus MUST be visible at every step

#### Scenario: Error message is announced

- GIVEN the call page transitions to the error state
- WHEN the error `<p role="alert">` mounts
- THEN screen readers MUST announce the error text on the next interaction
- AND the "Reintentar" button MUST be reachable by `Tab`

#### Scenario: En vivo status uses aria-live

- GIVEN the call page is rendered
- WHEN the top bar mounts
- THEN the `"En vivo"` element MUST carry `aria-live="polite"`

#### Scenario: Icon-only buttons have aria-label

- GIVEN a button is rendered with only an icon (no visible text)
- WHEN the DOM is inspected
- THEN the button MUST have a non-empty `aria-label`

## Modality Toggle Additions (2026-06-19)

The following requirement is ADDED to the video-calls-ui spec by the `2026-06-19-modality-toggle` change. The `JoinCallButton` component gains a new required `modalidad` prop; the visibility rule adds a hard gate for `modalidad === 'PRESENCIAL'` (the button returns `null`, not a disabled state). The detail page integration gains the new prop pass-through. The call page itself (`/citas/[id]/llamada`) is unaffected — by the time the user reaches the call page, the modality gate is enforced server-side by `getRoomToken` (see `video-calls-api/spec.md` REQ-VA-MOD-1), and a PRESENCIAL cita never receives a token to land on the page.

### Requirement: REQ-VU-MOD-1 — JoinCallButton modality prop and PRESENCIAL gate

The `JoinCallButton` component (`src/components/booking/JoinCallButton.tsx`) MUST accept a new REQUIRED prop `modalidad: ConsultaModalidad` (in addition to the existing `citaId`, `estado`, `fechaHora`, `isDoctor` props). The prop is REQUIRED (not optional) — a missing prop is a TypeScript compile error, NOT a runtime fallback. The prop is the single source of truth for the modality; the component MUST NOT fetch or derive the modality itself.

The visibility rule MUST be extended with a hard gate that runs FIRST (before the existing status / time-window checks):

- When `modalidad === 'PRESENCIAL'`, the component MUST return `null` — no button, no wrapper, no hidden div, no empty space. Returning `null` is the cleanest expression of "this UI does not apply" (per D7 / AD-7 in the proposal). A disabled button with a tooltip is explicitly rejected — disabled buttons that go nowhere invite confusion.
- When `modalidad === 'ONLINE'`, the existing status / time-window visibility rule applies unchanged (see REQ-VC-UI-1 above).

The button's render output (icon, label, click handler) MUST be unchanged from the pre-change version. The new prop only adds a new visibility condition; the click target, the navigation path, and the visual chrome all stay the same.

The detail page integration MUST pass `modalidad={cita.modalidad}` to BOTH the doctor-view and patient-view `<JoinCallButton>` instances. The Drizzle `timestamp` → `Date` conversion pattern is unchanged (the `new Date(cita.fechaHora)` wrap is applied to `fechaHora`, NOT to `modalidad` — `modalidad` is a string).

#### Scenario: PRESENCIAL cita hides the button (hard gate, no fallback)

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 5 minutes in the future
- WHEN `JoinCallButton` renders (with `modalidad="PRESENCIAL"`)
- THEN the button MUST NOT be in the DOM
- AND no disabled button, no tooltip, no hidden div, no empty space MUST be visible
- AND the detail page layout MUST be visually identical to the pre-change layout (no residue from the hidden button)

#### Scenario: ONLINE cita within the window shows the button

- GIVEN a cita with `modalidad === 'ONLINE'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 5 minutes in the future
- WHEN `JoinCallButton` renders (with `modalidad="ONLINE"`)
- THEN the button MUST be in the DOM
- AND it MUST display a `Video` icon and the text `"Unirse a la videollamada"`
- AND it MUST link to `/citas/${citaId}/llamada` on click

#### Scenario: Missing modalidad prop is a TypeScript compile error

- GIVEN the updated `JoinCallButton` props interface
- WHEN a call site mounts the component without a `modalidad` prop
- THEN TypeScript MUST reject the JSX (the prop is required, not optional)
- AND the build MUST fail (no silent runtime default)

#### Scenario: PRESENCIAL + EN_CURSO still hides the button

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'EN_CURSO'`
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM (the modality gate runs BEFORE the status check — a PRESENCIAL cita is hidden regardless of `estado`)

#### Scenario: PRESENCIAL + outside time window still hides the button (idempotent)

- GIVEN a cita with `modalidad === 'PRESENCIAL'` AND `estado === 'CONFIRMADA'` AND `fechaHora` 30 minutes in the future
- WHEN `JoinCallButton` renders
- THEN the button MUST NOT be in the DOM (the modality gate hides it; the time-window check is never reached)
- AND the visible result MUST be identical to the existing "outside window" case (no observable difference to the user)

#### Scenario: Detail page passes modalidad in both views

- GIVEN the detail page renders for a cita with `modalidad === 'ONLINE'`
- WHEN the page renders
- THEN BOTH the doctor view and the patient view MUST mount `<JoinCallButton>` with `modalidad={cita.modalidad}` (the prop is passed in both places, not just one)
- AND the `cita.modalidad` value MUST be sourced from the same `getMyAppointments` / detail query that supplies the other cita fields (no extra round-trip)

## LiveKit Webhooks Additions (2026-06-19)

The following requirement is ADDED to the video-calls-ui spec by the `2026-06-19-livekit-webhooks` change. The D10 limitation footer — the "quedará en 'En curso'" confession rendered under the `<LiveKitRoom>` on `src/app/citas/[id]/llamada/page.tsx` — is REMOVED. After this change ships, the call page does NOT display the footer: the auto-complete on `room_finished` webhook (see `video-calls-api/spec.md` REQ-VCA-WH-2) handles the transition end-to-end. The footer text and its existing call-page test assertion are deleted; a "does not render" assertion replaces the "renders" assertion. **D10 is RESOLVED.**

### Requirement: REQ-VCU-WH-1 — Known-Limitation Footer Note (REMOVED)

(Reason: D10 limitation is RESOLVED by `autoCompleteOnRoomFinishedUseCase` per `video-calls-api/spec.md` REQ-VCA-WH-2. The footer was a "we know this is broken" confession; after the webhook ships, the limitation no longer exists.)

(Migration: The pre-existing `### Requirement: Known-Limitation Footer Note` block was DELETED from this spec by this delta — the call page no longer renders the D10 footer note in any state.)

The call page MUST NOT display the D10 limitation footer in any state (loading, error, or success).

#### Scenario: Footer note is absent from the call page

- GIVEN the call page is rendered in any state (loading / error / success)
- WHEN the DOM is inspected
- THEN no element MUST contain the text `"quedará en 'En curso'"`
- AND the footer block that linked from the call page to `/citas/${citaId}` for manual completion MUST NOT be in the DOM

#### Scenario: Call page test asserts the footer is not rendered

- GIVEN `src/app/citas/[id]/llamada/__tests__/page.test.tsx`
- WHEN the test runs after the change is applied
- THEN a "footer does NOT render" assertion MUST be present (asserts no element contains `"quedará en 'En curso'"`)
- AND the prior "footer renders" assertion MUST be absent (the assertion was deleted, not just inverted)
