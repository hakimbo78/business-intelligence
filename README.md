# AI Location Business Intelligence

> AI-powered Location Decision Intelligence Platform untuk membantu UMKM menentukan area dan kandidat lokasi ekspansi.

## Overview

Platform ini menghasilkan **Location Intelligence Report** yang membantu pemilik bisnis memahami:
- Peluang pasar & target customer
- Kompetisi & market gap hypothesis
- Accessibility & location cost
- Revenue scenarios & financial viability
- Risks & field validation requirements

**Produk ini menjual Location Decision Intelligence, bukan sekadar data.**

> ⚠️ Report ini adalah analytical decision-support product. Bukan jaminan keberhasilan bisnis, investment advice, legal advice, property due diligence, atau financial assurance.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Fastify |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ORM | Prisma |
| Testing | Vitest |
| CI/CD | GitHub Actions |
| Containerization | Docker Compose |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- Docker & Docker Compose
- Git

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hakimbo78/business-intelligence.git
   cd business-intelligence
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env if needed (defaults work for local development)
   ```

4. **Start the database:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

5. **Run database migrations:**
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

7. **Verify it works:**
   ```bash
   curl http://localhost:3000/health
   ```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires running database)
npm run test:integration

# Watch mode
npm run test:watch
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run lint` | ESLint over src/, tests/ and scripts/ |
| `npm run typecheck` | Type-check src/, tests/ and scripts/ |
| `npm run db:migrate:dev` | Create/apply database migrations |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |

## Architecture

```
src/
├── config/              # Environment & database configuration
│   ├── environment.ts   # Zod-validated env loading + cross-field checks
│   └── database.ts      # Prisma client singleton
├── providers/           # External provider abstractions
│   ├── location/        # LocationProvider: mock | google
│   ├── ai/              # AIProvider: mock | gemini | openrouter
│   ├── demographics/    # DemographicProvider (mock)
│   └── trends/          # TrendsProvider (mock)
├── agents/              # One agent per analysis capability
│   ├── intake.agent.ts               # Brief → structured project
│   ├── research-planner.agent.ts     # Project → research plan
│   ├── candidate-discovery.agent.ts  # Plan → candidate pool
│   ├── competition|demand|market-gap|accessibility.agent.ts
│   ├── financial.agent.ts            # Deterministic, no LLM
│   ├── scoring.agent.ts              # Deterministic scores, LLM only explains
│   ├── shortlist.agent.ts            # Funnel filters
│   ├── report.agent.ts               # Structured report JSON
│   └── qa.agent.ts                   # Review; never delivers
├── lib/                 # Deterministic calculators & shared utilities
│   ├── financial-calculator.ts   # Revenue, profit, break-even, payback
│   ├── financial-inputs.ts       # Required inputs + customer-facing wording
│   ├── project-types.ts          # The three products and how each branches
│   ├── location-cost.ts          # Initial Location Investment (§12)
│   ├── property-normalizer.ts    # Permitted sources + annual→monthly rent
│   ├── scoring-calculator.ts     # Versioned scoring model
│   ├── disclaimer.ts             # Mandatory legal disclaimer (§28)
│   └── logger.ts                 # Structured JSON logger
├── repositories/        # Data access, incl. data-source provenance
├── queue/               # Job queue + polling worker with retries
├── routes/              # Fastify route definitions
├── scripts/             # Operator scripts (e2e demo, PDF rendering)
├── app.ts               # Fastify application builder
└── server.ts            # HTTP server entry point
```

### Provider Abstraction

```
LocationProvider (interface)
├── MockLocationProvider   → MAP_PROVIDER=mock   (development)
└── GoogleMapsProvider     → MAP_PROVIDER=google  (staging/production)

AIProvider (interface)
├── MockAIProvider         → AI_PROVIDER=mock       (development & tests)
├── GeminiAIProvider       → AI_PROVIDER=gemini
└── OpenRouterAIProvider   → AI_PROVIDER=openrouter
```

Business logic is never coupled to a specific map or LLM provider.

### Report Pipeline

`POST /api/projects/:id/generate-full-report` enqueues a job that the worker runs
end to end:

```
readiness check → research plan → candidate discovery (AREA_SCOUTING only)
  → competition → demand → market gap → accessibility → financial
  → scoring → shortlist → report → QA → REVIEW (awaiting owner)
```

The readiness check runs first so a project missing required financial inputs
fails immediately instead of after eight billed agent calls.

**QA never delivers.** A QA pass only clears a report for the owner; solely
`POST /api/projects/:id/approve` moves it past `REVIEW`
(PROJECT_MASTER_SPEC.md §35, BUILD_ROADMAP.md Phase 14).

### The Three Products

An order says which product it is (`projectType`), because they take different
paths through the pipeline. `GET /api/projects/types` returns this table live.

| | Who supplies the premises | Discovery runs? | Deliverable |
|---|---|---|---|
| `VALIDATION` | Client, 1 premises | No | Go / no-go on that premises, with risks |
| `COMPARISON` | Client, 2–5 premises | No | A ranking of the client's own options |
| `AREA_SCOUTING` | Nobody — we search | Yes | Recommended **micro-areas** to search in |

**`AREA_SCOUTING` recommends areas, not buildings.** Naming specific available
premises would require property availability data we are not permitted to scrape
(PROJECT_MASTER_SPEC.md §7), so the deliverable is street segments and clusters;
the client finds the premises there themselves.

For `VALIDATION` and `COMPARISON` the funnel does **not** filter. The client
asked whether *their* choices hold up, and answering "we filtered yours out"
would not be an answer — so every supplied premises is carried into the report,
with budget findings stated inside it.

An order whose type requires premises but has none attached is refused before
the pipeline spends anything (`GET /api/projects/:id/readiness`).

### Property Rent Benchmark

Clients supply the premises they want assessed, so every `VALIDATION` and
`COMPARISON` order deposits a **real rent for a real area** into
`property_listings`. Those accumulated observations are what will let
`AREA_SCOUTING` quote a concrete rent range per micro-area instead of a generic
verdict — the moat described in §30.

Listings enter through `POST /api/properties`, from the sources §7 permits only:
licensed providers, agents, owners, the customer, or a field survey.
**Marketplace scraping is rejected** by `property-normalizer.ts`. Rent quoted
annually is divided into a monthly figure and flagged `rentIsDerived`.

### API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + database check (503 when the DB is down) |
| `GET` | `/api/projects/types` | The three products and their rules |
| `GET` | `/api/projects` | List projects, newest first |
| `POST` | `/api/projects` | Create a project from structured input |
| `POST` | `/api/projects/intake` | Create a project from a natural-language brief |
| `GET` | `/api/projects/:id` | Project with profile, search, candidates, competitors |
| `GET` | `/api/projects/:id/readiness` | Missing inputs and premises, with customer-facing wording |
| `PATCH` | `/api/projects/:id/financial-inputs` | Supply inputs the brief did not state |
| `POST` | `/api/projects/:id/generate-full-report` | Enqueue the full pipeline |
| `GET` | `/api/projects/jobs/:jobId` | Job status, attempts and error |
| `GET` | `/api/projects/:id/report` | Latest report with its review status |
| `POST` | `/api/projects/:id/approve` \| `/reject` | Owner decision |
| `GET` | `/api/properties/sources` | The permitted property sources |
| `POST` | `/api/properties` | Submit a listing from a permitted source |
| `POST` | `/api/properties/:id/verify` | Mark a listing as field-verified |
| `GET` | `/api/projects/:id/properties` | Listings available to this project |

Each pipeline stage is also exposed individually (`/research-plan`,
`/discover-candidates` (scouting only), `/competition-analysis`, `/demand-analysis`,
`/market-gap-analysis`, `/accessibility-analysis`, `/financial-analysis`,
`/scoring`, `/shortlist`, `/report`, `/qa`) for debugging and re-runs.

> **Not yet built:** authentication, authorization and rate limiting. Do not
> expose this API publicly (PROJECT_MASTER_SPEC.md §26).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Environment (development/staging/production/test) |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | Log level (fatal/error/warn/info/debug/trace) |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `CORS_ALLOWED_ORIGINS` | In production | — | Comma-separated allow-list of dashboard origins |
| `MAP_PROVIDER` | No | `mock` | Location provider (mock/google) |
| `GOOGLE_MAPS_API_KEY` | When `MAP_PROVIDER=google` | — | Google Maps API key |
| `AI_PROVIDER` | No | `mock` | LLM provider (mock/gemini/openrouter) |
| `GEMINI_API_KEY` | When `AI_PROVIDER=gemini` | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model id |
| `OPENROUTER_API_KEY` | When `AI_PROVIDER=openrouter` | — | OpenRouter API key |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | OpenRouter model id |

Every cross-field requirement above is enforced at startup by `src/config/environment.ts`,
so a misconfiguration fails immediately rather than halfway through a customer's report.

> **Development must stay on the mocks.** `MAP_PROVIDER=google` and
> `AI_PROVIDER=gemini|openrouter` spend real money per call
> (DEVELOPMENT_RULES.md §6). The test suite pins both to `mock` and deletes any
> API keys from the environment.

## Known Limitations

Recorded so nobody mistakes a gap for a finished feature:

- **No authentication, authorization or rate limiting** (§26). The API is for
  local and trusted-network use only.
- **`VALIDATION` and `COMPARISON` orders cannot complete yet.** The pipeline
  branches correctly and refuses an order with no premises attached, but nothing
  turns the client's address into a candidate yet — that is the next piece of work.
- **`AREA_SCOUTING` has no micro-area concept.** The funnel still produces POIs
  as candidates, not street segments or clusters. Until that exists, its output
  is not yet the deliverable this README describes.
- **No cost control** (§22). API and token spend is neither estimated nor capped
  before research runs.
- **Scoring is per project, not per candidate.** `location_candidates.composite_score`
  is never populated.
- **Dev dependency advisories** are pinned forward via `overrides` in
  `package.json` rather than by downgrading the Prisma CLI below the client version.

## Project Documentation

- [PROJECT_MASTER_SPEC.md](./PROJECT_MASTER_SPEC.md) — Source of truth
- [BUILD_ROADMAP.md](./BUILD_ROADMAP.md) — Phase-by-phase build plan
- [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md) — Engineering rules
- [AGENT_ORCHESTRATION_SPEC.md](./AGENT_ORCHESTRATION_SPEC.md) — AI agent architecture

## License

UNLICENSED — Private project.
