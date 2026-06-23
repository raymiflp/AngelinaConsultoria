# Design: UI Base — Application Shell

## Technical Approach

Layered composition: root server layout → client providers wrapper → Shell → Sidebar + Header + content slot. Sidebar is a fixed desktop panel that collapses to a Sheet drawer on mobile. Theme state is managed by next-themes (class strategy, system default). Auth state is consumed from next-auth session inside client components.

## Architecture Decisions

### Decision: Single providers.tsx composition

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Nest providers in layout.tsx | Layout needs `"use client"`, losing RSC benefits | ❌ |
| **Single `providers.tsx` composing Theme + TRPC** | Layout stays server, one client boundary, clean | ✅ |

### Decision: Navigation as config array

Nav items defined in `src/lib/navigation.ts` — array of `{ label, href, icon, active? }`. No CMS, no dynamic loading. Map to `<NavItem>` in Sidebar. Adding a section is a one-line change.

### Decision: Sidebar uses responsive + Sheet for mobile

Sidebar renders as `fixed w-64 hidden lg:flex` on desktop. On mobile, a `Sheet` (shadcn) is triggered from Header's hamburger button — same Sidebar content via children/portal pattern. No duplicate markup.

### Decision: Desktop sidebar header layout

Shell uses a CSS grid breakpoint: on `lg+`, the sidebar occupies `w-64` and the header/main area fills the remaining viewport. The `<Header>` spans the full top of the right area. The `<main>` slot scrolls independently below it.

## Data Flow

```
layout.tsx (RSC)
  └─ providers.tsx (client)
       ├─ ThemeProvider (next-themes — className='.dark', storageKey='theme')
       └─ TRPCProvider (existing — QueryClient + tRPC)
            └─ Shell
                 ├─ Sidebar ← navigation config (static)
                 ├─ Header
                 │    ├─ ThemeToggle → useTheme().setTheme('dark'|'light'|'system')
                 │    └─ UserMenu → useSession() → avatar / login link
                 └─ main (props.children)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/providers.tsx` | Create | Wraps ThemeProvider → TRPCProvider → children |
| `src/components/Shell.tsx` | Create | CSS grid layout: sidebar + (header + main) |
| `src/components/Sidebar.tsx` | Create | Fixed sidebar with nav items, logo, user section |
| `src/components/Header.tsx` | Create | Top bar: mobile sheet trigger, branding, search, user area |
| `src/components/NavItem.tsx` | Create | Single nav link with icon, label, active state |
| `src/components/UserMenu.tsx` | Create | DropdownMenu: session check, avatar, settings, logout |
| `src/components/ThemeToggle.tsx` | Create | Switch + sun/moon icons, calls `useTheme().setTheme()` |
| `src/components/UserAvatar.tsx` | Create | Avatar with image fallback to initials |
| `src/lib/navigation.ts` | Create | Shared nav config array |
| `src/app/layout.tsx` | Create | Root layout: fonts, metadata, `<body>`, providers + Shell |
| `src/app/page.tsx` | Create | Simple redirect to `/dashboard` or landing placeholder |
| `src/components/ui/*.tsx` | Create | 8 shadcn components via CLI (button, sheet, avatar, dropdown-menu, separator, tooltip, switch, command) |

## Interfaces / Contracts

```ts
// src/lib/navigation.ts
interface NavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean; // for active state matching
}

const navItems: NavItemConfig[] = [
  { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard, exact: true },
  { label: "Patients",   href: "/patients",   icon: Users },
  { label: "Appointments", href: "/appointments", icon: Calendar },
  { label: "Prescriptions", href: "/prescriptions", icon: FileText },
  { label: "Messages",   href: "/messages",   icon: MessageSquare },
  { label: "Settings",   href: "/settings",   icon: Settings },
];
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | ThemeToggle toggles `<html>` class | `render(<ThemeToggle />)`, mock `useTheme`, assert `.dark` added/removed |
| Unit | Sidebar renders all nav items | `render(<Sidebar />)`, assert each `href` is present |
| Unit | UserMenu shows login link when unauthenticated | mock `useSession` returning `null`, assert login link rendered |
| Integration | Shell renders sidebar + header + children | render Shell with test child, assert all regions present |
| Build | `npm run build` passes | `npx next build` with zero type/lint errors |

## Migration / Rollout

No migration required. This is greenfield layout code with no existing pages to migrate. `/dashboard` and sibling routes will be created in follow-up changes.

## Open Questions

- None — all decisions are scoped and resolved against the proposal.
