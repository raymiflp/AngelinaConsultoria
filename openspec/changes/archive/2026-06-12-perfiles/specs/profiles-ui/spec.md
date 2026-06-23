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

The system SHALL render a read-only public doctor profile card accessible without authentication.

#### Scenario: View public doctor card

- GIVEN a valid doctorId
- WHEN any user navigates to `/doctores/[id]`
- THEN the page SHALL display nombreCompleto, especialidad, biografia, precioConsulta, and calificacionMedia using Card, Badge, and Avatar components

#### Scenario: Doctor not found

- GIVEN a non-existent doctorId
- WHEN a user navigates to `/doctores/[id]`
- THEN the page SHALL display a NOT_FOUND state with a "Volver" link

#### Scenario: Loading state

- GIVEN a user navigating to `/doctores/[id]`
- WHEN getDoctorProfile is in flight
- THEN the page SHALL render Skeleton placeholders for the doctor card

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
