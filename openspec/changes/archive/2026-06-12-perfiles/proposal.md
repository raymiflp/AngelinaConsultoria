# Proposal: Perfiles (Doctor & Patient Profiles)

## Intent

Users need to view and manage their own profile data. Doctors must edit professional info (specialty, bio, price), patients must manage personal info and medical notes. Currently there are no profile pages or tRPC endpoints — the `profiles` router is an empty placeholder at `src/infrastructure/api/routers/profiles.ts`.

## Scope

### In Scope
1. tRPC profiles router: `getMyProfile` (protected), `updateMyProfile` (protected), `getDoctorProfile` (public), `getPatientProfile` (protected)
2. Profile page at `/perfil` — view/edit based on role (doctor vs patient)
3. Public doctor profile at `/doctores/[id]` — read-only view
4. Profile form components using shadcn Form, Input, Textarea, Select, Card, Badge
5. Install shadcn components: `form`, `input`, `textarea`, `select`, `card`, `badge`
6. Profile update logic with Zod validation, DB update, return updated profile

### Out of Scope
- Doctor verification workflow (admin approval) — future
- Profile photos / file upload — future (needs MinIO)
- Patient clinical history — future
- Ratings and reviews — future
- Advanced search — future

## Capabilities

### New Capabilities
- `profiles-api`: tRPC profiles router (getMyProfile, updateMyProfile, getDoctorProfile, getPatientProfile)
- `profiles-ui`: Profile pages (`/perfil`, `/doctores/[id]`) and form components

### Modified Capabilities
- `api-client`: New `profiles.*` typed hooks exposed automatically via `appRouter` merge
- `ui-navigation`: `/perfil` already wired in nav; `/doctores/[id]` must be added

## Approach

1. **tRPC router** (`src/infrastructure/api/routers/profiles.ts`): Implement 4 procedures using existing `protectedProcedure`/`publicProcedure` and Drizzle queries with relations. Zod schemas for update input validation.
2. **Profile page** (`src/app/perfil/page.tsx`): Client component. Calls `api.profiles.getMyProfile.useQuery()`, renders form in edit mode. Role-aware: doctors see specialty/bio/price, patients see birth date/address/medical notes.
3. **Public doctor page** (`src/app/doctores/[id]/page.tsx`): Server component using `createCaller` for public profile data. Read-only card layout.
4. **Shadcn install**: `npx shadcn@latest add form input textarea select card badge`
5. **Form**: Shared `ProfileForm` component that renders different fields per role via role switch.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/api/routers/profiles.ts` | Modified | Empty router → 4 tRPC procedures |
| `src/app/perfil/page.tsx` | New | Profile view/edit page |
| `src/app/doctores/[id]/page.tsx` | New | Public doctor detail page |
| `src/components/profiles/` | New | ProfileForm, DoctorProfileCard components |
| `src/infrastructure/auth/schemas.ts` | Modified | Add profile update Zod schemas |
| `src/components/ui/` | Modified | +form, input, textarea, select, card, badge |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing `profile` DB row for existing users | Med | `getMyProfile` returns `null` gracefully; UI shows "create profile" prompt |
| Role-switching UX complexity | Low | Single page with role branch; avoids dual-form confusion |
| Stale profile data after update | Low | `trpc.useUtils().profiles.getMyProfile.invalidate()` on mutation success |

## Rollback Plan

1. Revert `src/infrastructure/api/routers/profiles.ts` to empty `router({})`.
2. Delete `src/app/perfil/` and `src/app/doctores/[id]/`.
3. Delete `src/components/profiles/`.
4. No DB migration rollback needed — no schema changes.
5. Test: `build` passes, existing pages unaffected.

## Dependencies

- Shadcn components: form, input, textarea, select, card, badge

## Success Criteria

- [ ] `api.profiles.getMyProfile` returns the authenticated user's profile with role-appropriate data
- [ ] `api.profiles.updateMyProfile` persists changes and returns updated profile
- [ ] `api.profiles.getDoctorProfile` returns public doctor data without auth
- [ ] `/perfil` page renders and allows editing all profile fields per role
- [ ] `/doctores/[id]` renders a public read-only doctor card
- [ ] All tRPC input validation rejects malformed data with clear errors
- [ ] `npm run build` passes without errors
