# Tasks: UI Base — Application Shell

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500–600 (incl. ~320–400 auto-generated shadcn wrappers) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | size-exception |

```
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All phases in order | Single PR | ~200–250 reviewable lines after CLI boilerplate; fits within extended budget |

## Phase 0: shadcn Component Installation

- [x] 0.1 Run `npx shadcn@latest add button sheet avatar dropdown-menu separator tooltip switch`

## Phase 1: Layout Foundation

- [x] 1.1 Create `src/components/providers.tsx` — `"use client"` wrapping ThemeProvider (next-themes) → TRPCProvider → children
- [x] 1.2 Create `src/app/layout.tsx` — root layout: `lang="es"`, `suppressHydrationWarning`, Inter font via `next/font`, metadata with title template, imports and wraps providers + Shell
- [x] 1.3 Create `src/app/page.tsx` — simple landing placeholder or redirect to `/dashboard`

## Phase 2: Navigation Components

- [x] 2.1 Create `src/components/navigation.ts` — nav items config array: `{ label, href, icon: LucideIcon, pattern }` for Dashboard, Doctores, Citas, Pacientes, Perfil, Configuración
- [x] 2.2 Create `src/components/NavItem.tsx` — single nav link using `Link` from `next/navigation`, lucide icon, active state via `usePathname()` match with `variant="ghost"` styling
- [x] 2.3 Create `src/components/Sidebar.tsx` — `w-64 fixed` sidebar (desktop `lg:block`, mobile hidden), logo/branding top, maps nav items via `navigation.ts`, user section bottom
- [x] 2.4 Create `src/components/Header.tsx` — top bar: mobile Sheet trigger (hamburger), branding text, user area slot with ThemeToggle + UserMenu
- [x] 2.5 Create `src/components/Shell.tsx` — flex layout container composing Sidebar + Header + `<main>{children}</main>`; responsive behavior via CSS

## Phase 3: User & Theme Components

- [x] 3.1 Create `src/components/ThemeToggle.tsx` — Switch component with sun/moon lucide icons, uses `useTheme()` from next-themes, `aria-label` updates dynamically
- [x] 3.2 Create `src/components/UserAvatar.tsx` — Avatar + AvatarFallback with user initials (placeholder for now)
- [x] 3.3 Create `src/components/UserMenu.tsx` — DropdownMenu triggered by UserAvatar: user info, settings link, separator, logout action

## Phase 4: Testing

- [x] 4.1 Create smoke tests for Shell — renders sidebar, header, and child content region
- [x] 4.2 Create smoke tests for Sidebar — renders all nav items with correct `href` attributes
- [x] 4.3 Create smoke tests for NavItem — renders with link and correct href
- [x] 4.4 Create smoke tests for ThemeToggle — clicking toggles theme, shows correct icon
- [x] 4.5 Create smoke tests for UserMenu — renders login link when unauthenticated

## Phase 5: Verification

- [x] 5.1 Run `npm run type-check` — `tsc --noEmit` passes with zero errors
- [x] 5.2 Run `npm run test:run` — `vitest run` passes all tests (24 files, 161 tests)
- [x] 5.3 Run `npm run build` — `next build` succeeds (requires DATABASE_URL env var in .env.local)
