# Design — init-infra

## Approach

Create project infrastructure using declarative config files and orchestration.
No application code is written — only scaffolding, configuration, and documentation.

## Directory Layout

```
medico-consulta/
├── .devcontainer/devcontainer.json    # Dev environment
├── .github/
│   └── workflows/
│       ├── ci.yml                     # CI pipeline
│       └── deploy.yml                 # Deploy pipeline
├── docker/
│   └── dev/
│       └── postgres/
│           └── init.sql              # DB init script
├── docs/
│   └── SETUP.md                      # Setup guide
├── openspec/
│   └── changes/
│       └── init-infra/               # SDD artifacts for this change
├── src/
│   ├── app/globals.css               # Tailwind v4 + shadcn theme
│   ├── lib/utils.ts                  # cn() utility
│   ├── domain/                       # Clean Architecture layers
│   ├── application/
│   ├── infrastructure/
│   ├── presentation/
│   ├── shared/
│   ├── compliance/
│   └── seo/
├── tests/
│   └── setup.ts                      # Test bootstrap
├── .env.example                      # Environment template
├── .env.local.example                # Local overrides
├── .gitignore
├── .nvmrc
├── .prettierrc
├── .eslintrc.json
├── .dockerignore
├── Dockerfile                        # Multi-stage production build
├── components.json                   # shadcn/ui config
├── docker-compose.yml               # Dev services
├── next.config.ts                    # Next.js config with security
├── package.json                      # Dependencies & scripts
├── playwright.config.ts              # E2E config
├── postcss.config.mjs               # PostCSS + Tailwind v4
├── tsconfig.json                     # TypeScript strict config
├── vitest.config.ts                  # Unit test config
├── ARCHITECTURE.md                   # System architecture
└── README.md                         # Project overview
```

## Key Design Decisions

### 1. Next.js output: standalone (not default)
The Dockerfile uses `output: standalone` (via next.config) to produce a
self-contained production image with only the necessary files.

### 2. Tailwind v4 CSS config (not JS)
Tailwind v4 uses CSS-based configuration via `@theme inline`. No
`tailwind.config.ts` file exists. The `components.json` sets `"config": ""`
to tell shadcn/ui not to look for a JS config file.

### 3. Vitest over Jest
Vitest is faster, natively supports TypeScript and ESM, and shares the Vite
plugin ecosystem. Configuration is simpler and integrates directly with the
project's `@/` path alias.

### 4. Security headers in next.config
Health data requires HSTS, X-Frame-Options, and Permissions-Policy headers.
These are configured at the Next.js level to apply to all routes.

## Dependencies

Config files reference each other:
- `package.json` → all configs depend on it for module resolution
- `tsconfig.json` → vitest.config.ts, next.config.ts use paths alias
- `postcss.config.mjs` → consumed by Next.js build pipeline
- `components.json` → references globals.css for shadcn/ui token extraction

No runtime coupling between services (Docker services are independent).

## Risks

| Risk | Mitigation |
|------|-----------|
| `@tailwindcss/postcss` version mismatch with Tailwind v4 | Pin exact versions in package.json |
| Docker port conflicts on developer machine | Use non-standard ports or document conflict resolution in SETUP.md |
| CI E2E tests timeout | Set 30-minute timeout, use `reuseExistingServer: true` locally |
| Missing environment variables | `.env.example` is authoritative; CI sets required vars explicitly |
