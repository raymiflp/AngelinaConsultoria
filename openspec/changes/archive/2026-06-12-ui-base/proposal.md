# Proposal: UI Base — Application Shell

## Intent

Establish the visual foundation: root layout, sidebar, header with user menu, and dark mode. Without this shell every feature solves layout independently — inconsistent and duplicated. This change provides a single scaffolding all pages render inside.

## Scope

### In Scope
1. Root layout (`src/app/layout.tsx`) with fonts, metadata, tRPC + theme providers
2. Theme provider using next-themes (`.dark` class, system preference default)
3. Install shadcn/ui component wrappers: Button, Sheet, Avatar, DropdownMenu, Separator, Tooltip, Switch, Command
4. Sidebar navigation with links to main sections (Dashboard, Patients, Appointments, Prescriptions, Messages, Settings)
5. Header with branding, user avatar/dropdown menu, theme toggle
6. Shared layout components: Shell, NavItem, UserMenu, ThemeToggle

### Out of Scope
- Page-level content (dashboard, profiles, login) — follow-up changes
- Mobile responsive refinements beyond basic sidebar sheet collapse
- Animations, transitions, breadcrumbs, tabs, i18n (deferred)

## Capabilities

### New Capabilities
- `ui-layout`: Root layout, providers, metadata config, font loading
- `ui-navigation`: Sidebar, header, nav items, Shell component
- `ui-theme`: Dark mode toggle, theme provider, system preference detection

### Modified Capabilities
- None

## Approach

Root layout uses Next.js metadata for SEO, loads fonts via `next/font`, wraps children with `<ThemeProvider>` (next-themes) and existing tRPC provider. Shell renders a persistent sidebar (desktop) or Sheet-based drawer (mobile) plus content slot. Sidebar uses lucide-react icons + shadcn Button (`variant="ghost"`). Install wrappers via `npx shadcn@latest add`. Theme persists in localStorage.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/layout.tsx` | New | Root layout with providers, fonts, metadata |
| `src/components/layout/` | New | Shell, Sidebar, Header, NavItem, UserMenu, ThemeToggle |
| `src/components/ui/` | New | shadcn component wrappers (8 files) |
| `src/components/theme-provider.tsx` | New | next-themes `<ThemeProvider>` wrapper |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| shadcn install conflicts with existing Radix | Low | Pre-installed; `--dry-run` first |
| Theme FART (flash of wrong theme) | Med | next-themes `<script>` + `suppressHydrationWarning` |
| Breaking existing tRPC provider | Low | Wrap, don't modify |

## Rollback Plan

1. Delete `src/app/layout.tsx`
2. Delete `src/components/` directory entirely
3. Revert `next.config.ts` font additions via `git checkout`
4. Run `npm run build` to verify clean state

## Dependencies

- `npx shadcn@latest` CLI (available via node_modules)
- next-themes (already in `package.json`)

## Success Criteria

- [ ] `npm run build` succeeds with zero type/lint errors
- [ ] Layout renders on all routes with sidebar + header
- [ ] Dark mode toggles and persists across reload
- [ ] Sidebar nav links navigate to defined routes
- [ ] User menu shows avatar placeholder + logout action
- [ ] All installed shadcn components render without console errors
