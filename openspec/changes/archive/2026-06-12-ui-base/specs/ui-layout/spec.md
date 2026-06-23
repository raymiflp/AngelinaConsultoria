# UI Layout Specification

## Purpose

Define the root application layout — providers, fonts, metadata, and document structure — that wraps every page in the medico-consulta application.

## Requirements

### Requirement: Root Document Structure

The root layout MUST render a valid HTML document with `lang="es"` on the `<html>` element and `suppressHydrationWarning` to prevent hydration mismatches from next-themes class injection.

#### Scenario: Renders expected document attributes on first paint

- GIVEN a browser requests any route
- WHEN the server renders the root layout
- THEN the `<html>` element MUST have `lang="es"`
- AND the `<html>` element MUST have `suppressHydrationWarning`

### Requirement: Font Loading

The layout SHOULD load the Inter font family via `next/font` with Latin subset and apply it as the global CSS font-family variable.

#### Scenario: Inter font is available at runtime

- GIVEN the root layout is rendered
- WHEN the page loads in the browser
- THEN the computed `font-family` on body text MUST resolve to Inter
- AND no flash of unstyled text (FOUT) MUST occur

### Requirement: Metadata Configuration

The layout MUST export metadata with a title template (`%s — MedicoConsulta`), a default description, and a responsive viewport configuration.

#### Scenario: Metadata is present in document head

- GIVEN the root layout is requested
- WHEN inspecting the document `<head>`
- THEN a `<title>` element MUST exist with the template pattern
- AND a `<meta name="description">` MUST exist
- AND a `<meta name="viewport">` with `width=device-width, initial-scale=1` MUST exist

### Requirement: Theme Provider Wrapping

The layout MUST wrap its children with `<ThemeProvider>` from next-themes configured with `attribute="class"`, `defaultTheme="system"`, and `enableSystem`.

#### Scenario: Dark mode class is applied based on system preference

- GIVEN the user's OS is set to dark mode
- WHEN the root layout renders
- THEN `<html>` MUST have class `dark`
- WHEN the user's OS switches to light mode
- THEN `<html>` MUST remove class `dark`

### Requirement: tRPC Provider Wrapping

The layout MUST nest `<TRPCProvider>` inside `<ThemeProvider>` to provide tRPC client and React Query context to the entire application tree.

#### Scenario: tRPC context is available in child components

- GIVEN a child component rendered inside the layout
- WHEN it calls `api.someProcedure.useQuery()`
- THEN the query MUST execute without a missing-provider error
- AND React Query devtools SHOULD be available in non-production builds

### Requirement: Provider Ordering

The provider nesting order MUST be: ThemeProvider (outer) → TRPCProvider (inner) → children. This ensures theme context is available before tRPC rendering.

#### Scenario: Theme context precedes tRPC in the component tree

- GIVEN the component tree is inspected
- WHEN tracing parent-to-child nesting at runtime
- THEN `<ThemeProvider>` MUST be an ancestor of `<TRPCProvider>`
