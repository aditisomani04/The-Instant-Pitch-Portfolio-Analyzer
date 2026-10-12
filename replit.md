# Instant Pitch

Instant Pitch helps students and job seekers turn a resume and public portfolio links into an evidence-based personal brand summary, strengths, elevator pitch, and LinkedIn headline.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/instant-pitch/` — React web app and browser-side resume extraction
- `artifacts/api-server/src/routes/pitch.ts` — AI analysis and spoken pitch endpoints
- `artifacts/api-server/src/lib/portfolio-sources.ts` — bounded, public-HTTPS text extraction
- `lib/api-spec/openapi.yaml` — source of truth for API contracts

## Architecture decisions

- The initial product is stateless: no accounts or server-side resume history. Resume files are read in the browser, and extracted text is sent for AI analysis.
- LinkedIn and other restricted pages may be inaccessible. Never imply these sources were read; continue with the resume and accessible sources and show the limitation.
- Spoken pitches use AI-generated audio, not browser speech synthesis.

## Product

- PDF, DOCX, and TXT resume upload or pasted resume text
- Public GitHub, LinkedIn, and personal website text extraction
- Contextual brand summary, three technical strengths, and three soft strengths with supporting evidence
- An approximately 30-second elevator pitch with on-demand spoken audio
- A LinkedIn headline limited to 140 characters, plus copy controls

## User preferences

Keep the interface simple to use for students and job seekers.

## Gotchas

- Re-run API codegen after changing the OpenAPI spec.
- Resume text and generated speech are not persisted server-side.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
