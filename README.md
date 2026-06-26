# 🏥 angelina-consultoria

Plataforma de salud digital que conecta pacientes con doctores verificados.
Consultas online, videoconsulta, historial clínico y seguimiento.

## Stack

| Capa        | Tecnología                                                       |
| ----------- | ---------------------------------------------------------------- |
| Frontend    | Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn               |
| Backend     | Next.js API Routes + tRPC                                        |
| DB          | Vercel Postgres + Drizzle ORM                                    |
| Cache       | Upstash REST (Redis-compatible)                                  |
| Tiempo real | LiveKit Cloud (videollamadas WebRTC)                             |
| Auth        | Auth.js v5 + Zod                                                 |
| Storage     | Vercel Blob (forward-looking)                                    |
| Monitor     | Sentry + PostHog                                                 |
| Docs        | react-pdf                                                        |
| Infra       | Vercel + GitHub Actions                                          |

> **ADR-0001**: la plataforma se despliega exclusivamente en Vercel +
> servicios gestionados. Sin VPS, sin Docker en producción. Ver
> [`docs/architecture/decisions/0001-vercel-only.md`](./docs/architecture/decisions/0001-vercel-only.md).

## Requisitos

- Node.js 22+
- pnpm 11+ (vía `corepack enable && corepack prepare pnpm@11 --activate`)
- Docker (solo Postgres + Redis para dev local)
- Cuenta gratuita en [LiveKit Cloud](https://livekit.cloud) (para
  videollamadas en dev)
- Cuenta gratuita en [Upstash](https://upstash.com) (opcional, para
  rate-limiting y caché en dev)

## Inicio rápido

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd angelina-consultoria
pnpm install

# 2. Arrancar servicios locales
docker compose up -d postgres redis

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con valores de LiveKit Cloud + Upstash

# 4. Migrar DB y sembrar datos de dev
pnpm db:migrate
pnpm seed:dev

# 5. Iniciar desarrollo
pnpm dev
```

Sigue [`docs/dev-setup.md`](./docs/dev-setup.md) para la guía completa
(incluye smoke test de videollamada con dos pestañas).

## Scripts disponibles

| Script              | Descripción                                |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Inicia servidor de desarrollo              |
| `pnpm build`        | Build producción                           |
| `pnpm test:run`     | Tests unitarios (Vitest)                   |
| `pnpm test:e2e`     | Tests end-to-end (Playwright)              |
| `pnpm db:studio`    | Drizzle Studio (gestión DB)                |
| `pnpm db:migrate`   | Aplica migraciones Drizzle                 |
| `pnpm seed:dev`     | Crea doctor + paciente + cita de prueba    |
| `pnpm lint`         | ESLint                                     |
| `pnpm type-check`   | TypeScript sin emitir                      |
| `pnpm format`       | Prettier                                   |

## Arquitectura

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para la arquitectura completa del sistema,
incluyendo Clean Architecture, capa de compliance y modelo de datos.

## Despliegue

Ver [`docs/deployment.md`](./docs/deployment.md) para el runbook de
despliegue a Vercel (secrets requeridos, orden de operaciones, rollback).

## Licencia

Privado — todos los derechos reservados.
