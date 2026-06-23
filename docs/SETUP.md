# Setup — angelina-consultoria

## Entorno de desarrollo

### 1. Requisitos previos

- **Node.js**: v22+ (ver `.nvmrc`)
- **Docker**: Docker Desktop o Rancher Desktop
- **Git**: cli configurado

### 2. Clonar e instalar

```bash
git clone <repo-url>
cd angelina-consultoria
npm install
```

### 3. Servicios con Docker

```bash
# Arrancar PostgreSQL, Redis, MinIO y Meilisearch
docker compose up -d

# Arrancar LiveKit (servidor de videollamadas self-hosted)
docker compose up -d livekit

# Verificar que todos están healthy
docker compose ps
```

Las variables de entorno para LiveKit (`LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`) deben estar en
`.env.local` antes de iniciar el servidor de Next.js. Consulta
[`docs/livekit.md`](./livekit.md) para la configuración completa.

### 4. Variables de entorno

```bash
cp .env.example .env.local
# Editar .env.local con valores locales
```

### 5. Base de datos

```bash
# Generar migraciones desde schema
npm run db:generate

# Aplicar migraciones a PostgreSQL
npm run db:migrate

# (Opcional) Abrir Drizzle Studio para gestionar datos
npm run db:studio
```

### 6. Desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev
# Abrir http://localhost:3000
```

## Testing

```bash
# Tests unitarios (watch mode)
npm run test

# Tests unitarios (una ejecución + cobertura)
npm run test:run -- --coverage

# Tests E2E (requiere servidor dev funcionando)
npm run test:e2e
```

## Docker para producción

```bash
# Build imagen
docker build -t angelina-consultoria .

# Ejecutar
docker run -p 3000:3000 --env-file .env.production angelina-consultoria
```

## Solución de problemas

| Problema                     | Solución                                        |
| ---------------------------- | ----------------------------------------------- |
| `port 5432 already in use`   | `docker compose stop postgres` o cambiar puerto |
| `Cannot connect to Redis`    | `docker compose up -d redis`                    |
| `Module not found`           | `npm install`                                   |
| `next: not found`            | `npm install` (node_modules corruptos)          |
