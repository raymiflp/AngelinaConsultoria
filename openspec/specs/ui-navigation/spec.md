# UI Navigation Specification

## Purpose

Define the Shell component — the persistent layout scaffold with sidebar navigation, header bar, and user menu that surrounds page content across the application.

## Requirements

### Requirement: Shell Layout Structure

The Shell component MUST render a sidebar (left) and a main content area (right) in a flex layout. The sidebar MUST be fixed to the viewport left edge and span the full viewport height.

#### Scenario: Sidebar is visible and fixed on desktop

- GIVEN a desktop viewport (≥1024px)
- WHEN the Shell renders
- THEN the sidebar MUST be visible on the left
- AND the sidebar MUST be `position: fixed` with full viewport height
- AND the main content MUST be offset to not overlap the sidebar

#### Scenario: Sidebar collapses to Sheet on mobile

- GIVEN a mobile viewport (<768px)
- WHEN the Shell renders
- THEN the sidebar MUST be hidden by default
- AND a hamburger button MUST be visible in the header
- WHEN the user taps the hamburger button
- THEN a Sheet drawer MUST open showing the sidebar content

### Requirement: Sidebar Navigation Items

The sidebar MUST render the logo/branding at the top, followed by navigation items. Each item MUST display an icon and a label. Some items are role-restricted — admin-only items MUST only render when the authenticated user's role is `ADMIN`.

Base (non-restricted) items: Patients, Appointments, Prescriptions, Messages, Settings.
Admin-only items (visible only when `userRole === "ADMIN"`): Dashboard (`/dashboard`), Doctores (`/dashboard/doctores`).

#### Scenario: Active nav item is highlighted by route

- GIVEN the current route is `/dashboard`
- WHEN the sidebar renders
- THEN the Dashboard item MUST have an active visual state (different background/text color)
- AND clicking Patients MUST navigate to `/patients`

#### Scenario: All nav items render with correct icons

- GIVEN the sidebar is rendered
- WHEN inspecting each nav item
- THEN each item MUST show its corresponding lucide-react icon next to the label
- AND each item MUST be a link (`<Link>` from next/navigation)

#### Scenario: Admin user sees admin nav items

- GIVEN an authenticated user with `role === "ADMIN"`
- WHEN the sidebar renders
- THEN the user MUST see "Dashboard" and "Doctores" items in the sidebar

#### Scenario: Non-admin user does not see admin items

- GIVEN an authenticated user with `role === "DOCTOR"` or `role === "PACIENTE"`
- WHEN the sidebar renders
- THEN the user MUST NOT see "Dashboard" or "Doctores" items

#### Scenario: Active route highlights admin items

- GIVEN an admin user on `/dashboard` or `/dashboard/doctores`
- WHEN the sidebar renders
- THEN the matching admin nav item MUST have the active visual state (same as other nav items)

### Requirement: Header Bar

The Shell MUST render a header bar at the top of the main content area containing: hamburger menu (mobile only), branding text, a search placeholder, a theme toggle, and a user avatar dropdown.

#### Scenario: Header renders all elements on desktop

- GIVEN a desktop viewport
- WHEN the Shell renders
- THEN the header MUST display the branding text on the left
- AND a search input placeholder MUST be visible (non-functional, visual only)
- AND a theme toggle button MUST be visible on the right
- AND a user avatar MUST be visible next to the theme toggle
- AND the hamburger button MUST NOT be visible

### Requirement: User Menu

Clicking the user avatar MUST open a DropdownMenu showing: the user avatar and full name, their role, a "Settings" link, a Separator, and a "Logout" action.

#### Scenario: DropdownMenu shows user info and actions

- GIVEN the user is authenticated
- WHEN the user clicks their avatar in the header
- THEN a DropdownMenu MUST appear with avatar, name, and role
- AND a "Settings" item that navigates to `/settings`
- AND a "Logout" item
- WHEN the user clicks "Logout"
- THEN the session MUST be terminated and the user redirected to login

### Requirement: Responsive Behavior

The sidebar SHOULD collapse to an icons-only variant on medium viewports (768px–1024px) and to a Sheet-based drawer on small viewports. The header hamburger MUST control the mobile Sheet.

#### Scenario: Medium viewport shows collapsed sidebar

- GIVEN a viewport between 768px and 1024px
- WHEN the Shell renders
- THEN the sidebar MUST show only icons (labels hidden)
- AND the sidebar width MUST be narrower than desktop mode
