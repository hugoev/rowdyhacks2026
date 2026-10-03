# Repository Guidelines

## Project Structure & Module Organization

Tripwire is a RowdyHacks XII counter-scam prototype that combines call analysis with payment verification. The current scaffold uses Next.js, React, strict TypeScript, Tailwind CSS, and Socket.IO. Shared models live in `lib/types.ts`, deterministic scoring in `lib/risk.ts`, and scripted calls and scanner samples in `lib/scenarios.ts`. Static assets belong in `public/`.

Next.js views live in `app/`, shared UI in `components/`, the custom backend in `server/`, and unit and Playwright tests in `tests/`. Provider adapters and the call scheduler belong in `server/`. Keep protected-user, guardian, and relative views consistent through shared types and server events.

## Build, Test, and Development Commands

Use Node.js 22.22 or newer and npm:

- `npm ci`: install dependencies from the committed lockfile.
- `npm run dev`: watch the custom TypeScript server; requires `server/index.ts`.
- `npm run build`: generate the Next.js production build.
- `npm start`: launch the custom server in production after building.
- `npm run typecheck`: check TypeScript without emitting files.
- `npm test`: run `tests/*.test.ts` with the Node test runner through tsx.
- `npm run test:e2e`: run Playwright browser tests once configured.

Use `npm run eval:gemini` only for an explicit live evaluation with synthetic fixtures and a server-side API key.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single quotes, and semicolons. Use camelCase for functions and variables, PascalCase for types and React components, and descriptive module names. Reuse `lib/types.ts`; validate external inputs with Zod. No formatter or lint script is currently configured.

## Testing Guidelines

Name unit tests `*.test.ts`. Cover risk thresholds, routine-payment friction, failed safe words, callback responses, and approval or timer enforcement. Use Playwright for the cross-view demo flow. No coverage percentage is defined. Target alerts within ten seconds and correct scanner verdicts on eight of ten prepared samples.

## Commit & Pull Request Guidelines

The current team workflow is to commit and push directly to `main`, unless the user explicitly requests a feature branch or pull request. Apply these metadata rules to new work:

- Name branches `<type>/<short-kebab-case-description>`, such as `feat/payment-shield`, `fix/guardian-approval`, or `docs/setup-guide`. Use project-focused names; never use `agent/`, `codex/`, `ai/`, or other automation-identifying prefixes.
- Use Conventional Commit subjects: `<type>(<optional-scope>): <imperative description>`, such as `feat(teller): add payment holds`. Types include `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, and `revert`. Mark breaking changes with `!` and explain them in the body.
- Keep commits focused. Use the user's existing Git identity; do not add AI, bot, Codex, or automation attribution to commits, trailers, PRs, or repository files. Never amend commits unless explicitly requested.
- Use Conventional Commit formatting for PR titles. Descriptions should explain behavior, link relevant issues, report checks, and include screenshots for UI changes.

## Scope & Configuration

Prioritize MLH integrations while preserving the core payment, call, safe-word, callback, hold, and scanner flow. Label live versus simulated features explicitly. Copy `.env.example` to `.env`; never commit credentials or real personal data. Hash safe words, obtain listening consent, and use empathetic warnings that say "no red flags found" rather than "safe".
