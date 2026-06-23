# UI Theme Specification

## Purpose

Define the dark mode toggle component and theme persistence behavior, enabling users to switch between light, dark, and system-preferred themes.

## Requirements

### Requirement: Theme Toggle Component

The system MUST provide a ThemeToggle component that switches between light and dark modes. It MUST use the `useTheme` hook from next-themes and MUST display a sun icon in dark mode and a moon icon in light mode.

#### Scenario: ThemeToggle shows correct icon for current mode

- GIVEN the current theme is `light`
- WHEN the ThemeToggle renders
- THEN a sun icon MUST be visible
- WHEN the user clicks the toggle
- THEN the theme MUST switch to `dark`
- AND the icon MUST change to a moon

#### Scenario: ThemeToggle cycles through modes

- GIVEN the ThemeToggle is rendered with `light` active
- WHEN the user clicks the toggle once
- THEN the theme MUST change to `dark`
- WHEN the user clicks the toggle again
- THEN the theme MUST return to `light`

### Requirement: System Preference Detection

The ThemeProvider MUST be initialized with `defaultTheme="system"` and `enableSystem={true}`. When the user has no stored preference, the application MUST follow the OS-level color scheme.

#### Scenario: New user follows OS theme on first visit

- GIVEN a first-time visitor with no stored theme preference
- AND their OS is set to dark mode
- WHEN the application renders
- THEN the page MUST render in dark mode
- WHEN the user toggles the theme manually
- THEN a preference MUST be stored in localStorage
- AND subsequent visits MUST respect the stored preference over the OS setting

### Requirement: Persistence

The theme selection MUST persist across page reloads and browser sessions via localStorage. next-themes MUST handle reading and writing the preference.

#### Scenario: Theme persists after page reload

- GIVEN the user has selected dark mode
- WHEN the page is reloaded
- THEN the application MUST render in dark mode without flicker
- AND the ThemeToggle MUST show the moon icon

### Requirement: Accessibility

The ThemeToggle component MUST include a descriptive `aria-label` that indicates the current action (e.g., "Switch to dark mode" or "Switch to light mode").

#### Scenario: Screen reader announces toggle action

- GIVEN the current theme is light
- WHEN inspecting the ThemeToggle button
- THEN the button MUST have `aria-label="Switch to dark mode"`
- WHEN the user switches to dark mode
- THEN the `aria-label` MUST update to `"Switch to light mode"`

### Requirement: SSR Safety

The theme system MUST avoid hydration mismatch errors. The root layout MUST use `suppressHydrationWarning` on the `<html>` element, and next-themes MUST inject a blocking `<script>` to set the correct class before first paint.

#### Scenario: No theme flash on page load

- GIVEN the user has dark mode stored in localStorage
- WHEN the page loads
- THEN the `<html>` element MUST have the `dark` class BEFORE React hydrates
- AND no flash of light theme MUST be visible
