# Repository Guidelines

## Project Structure & Module Organization

The active product brief is PRD v3 in `docs/PRD.md`: a payment-only speaking safety teller, two ElevenLabs phone agents, and a family heist case file. Read that brief and `docs/integrations.md` before implementing provider or environment changes. Earlier docs are archived under `docs/archive/v2/` and must not drive new scope.

Current code still uses Next.js, React, strict TypeScript, Tailwind, SQLite, and Socket.IO from v2. Shared models are in `lib/types.ts`, backend/adapters in `server/`, UI in `app/` and `components/`, tests in `tests/`, assets in `public/`. V3 targets a bank app at `/`, call pages at `/call?who=rosa|diego`, hidden `/operator`, and `/case/:id`, with one in-memory session, SSE, and Tiger Data transactions/cases. These are planned, not yet implemented. Preserve existing state and teammates' work while migrating.

## Build, Test, and Development Commands

Use Node.js 22.22 or newer and npm:

- `npm ci`: install dependencies from the committed lockfile.
- `npm run dev`: watch the custom TypeScript server; requires `server/index.ts`.
- `npm run build`: generate the Next.js production build.
- `npm start`: launch the custom server in production after building.
- `npm run typecheck`: check TypeScript without emitting files.
- `npm test`: run `tests/*.test.ts` with the Node test runner through tsx.
- `npm run test:e2e`: run Playwright browser tests once configured.

Use `npm run check:live` to verify the Gemini Live gate and `npm run eval:live` only for an explicit red-team run with synthetic fixtures and server-side keys.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single quotes, and semicolons. Use camelCase for functions and variables, PascalCase for types and React components, and descriptive module names. Reuse `lib/types.ts`; validate external inputs with Zod. No formatter or lint script is currently configured.

## Testing Guidelines

Name unit tests `*.test.ts`. For v3, cover the payment anomaly gate, known $40 bill, saved-contact routing, verifier statuses, release enforcement, stale results after reset, and idempotent case writes. Use Playwright for the bank/call/operator flow. Acceptance targets and three-repeat gates are in `docs/VALIDATION.md`; existing v2 tests do not prove v3 readiness. Live provider calls use synthetic fixtures and require appropriate task authorization.

## Commit & Pull Request Guidelines

Before starting any implementation, check the working tree and sync the working branch with its remote: pull the latest changes and push any authorized local commits. Preserve uncommitted work and honor explicit instructions to keep a branch or changes unpushed.

If branches diverge or merge conflicts occur, inspect the differences. Resolve straightforward conflicts only when both changes can be preserved unambiguously; ask the user when resolution requires choosing between intended behaviors or could overwrite teammates' work. Never force-push or discard changes to make a sync succeed.

After implementation and relevant checks, commit only the task's changes, pull and integrate any newer remote changes, then push. If the remote advances during the push, pull again and repeat the conflict-handling process. Verify the working branch and its remote are synchronized before reporting completion. Apply the same explicit no-push exceptions at this stage.

The current team workflow is to commit and push directly to `main`, unless the user explicitly requests a feature branch or pull request. Apply these metadata rules to new work:

- Name branches `<type>/<short-kebab-case-description>`, such as `feat/payment-shield`, `fix/guardian-approval`, or `docs/setup-guide`. Use project-focused names; never use `agent/`, `codex/`, `ai/`, or other automation-identifying prefixes.
- Use Conventional Commit subjects: `<type>(<optional-scope>): <imperative description>`, such as `feat(teller): add payment holds`. Types include `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, and `revert`. Mark breaking changes with `!` and explain them in the body.
- Keep commits focused. Use the user's existing Git identity; do not add AI, bot, Codex, or automation attribution to commits, trailers, PRs, or repository files. Never amend commits unless explicitly requested.
- Use Conventional Commit formatting for PR titles. Descriptions should explain behavior, link relevant issues, report checks, and include screenshots for UI changes.

## Scope & Configuration

Prioritize the PRD v3 demo: Gemini is the audible bank teller; ElevenLabs powers both the consented scammer and stock-voice verifier; Tiger Data owns seeded payment history and case rows; Vultr coordinates one server process. Do not add dashboards, Con Meter, caller listening, family words, auth, blockchain, camera, or video to new v3 work. No actual bank payments or telephony API are connected.

Target keys: GEMINI_API_KEY, ELEVENLABS_API_KEY, EL_AGENT_SCAMMER_ID, EL_AGENT_VERIFIER_ID, TIGER_DATABASE_URL, PUBLIC_BASE_URL. Current templates/runtime use some legacy names; migrate consumers, templates, setup scripts, and private deployment configuration together. Never commit credentials or actual voice samples. Voice-owner consent must be supplied, never fabricated. Mark live, simulated, and operator-forced behavior honestly. Case-file claims and timings must come from the actual session. Node 22 remains the supported runtime until an explicit migration.
