# 🏥 angelina-consultoria

Plataforma de salud digital que conecta pacientes con doctores verificados.
Consultas online, videoconsulta, historial clínico y seguimiento.

## Stack

| Capa       | Tecnología                                          |
| ---------- | --------------------------------------------------- |
| Frontend   | Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn  |
| Backend    | Next.js API Routes + tRPC                           |
| DB         | PostgreSQL + Drizzle ORM                            |
| Cache      | Redis                                               |
| Búsqueda   | Meilisearch                                         |
| Tiempo real| Socket.io + LiveKit                                 |
| Auth       | Auth.js + Zod                                       |
| Monitor    | Sentry + PostHog                                    |
| Docs       | react-pdf                                           |
| Infra      | Vercel + Docker + GitHub Actions                    |

## Requisitos

- Node.js 22+
- Docker (para servicios: PostgreSQL, Redis, MinIO, Meilisearch)

## Inicio rápido

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd angelina-consultoria
npm install

# 2. Arrancar servicios
docker compose up -d

# 3. Configurar variables de entorno
cp .env.example .env.local

# 4. Iniciar desarrollo
npm run dev
```

## Scripts disponibles

| Script              | Descripción                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Inicia servidor de desarrollo              |
| `npm run build`     | Build producción                           |
| `npm run test:run`  | Tests unitarios                            |
| `npm run test:e2e`  | Tests end-to-end (Playwright)              |
| `npm run db:studio` | Drizzle Studio (gestión DB)                |
| `npm run lint`      | ESLint                                     |
| `npm run format`    | Prettier                                   |

## Arquitectura

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para la arquitectura completa del sistema,
incluyendo Clean Architecture, capa de compliance y modelo de datos.

## Licencia

Privado — todos los derechos reservados.
