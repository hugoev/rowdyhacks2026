# Repository Guidelines

## Project Structure & Module Organization

Tripwire is a RowdyHacks XII counter-scam prototype that combines call analysis with payment verification. The current scaffold uses Next.js, React, strict TypeScript, Tailwind CSS, and Socket.IO. Shared models live in `lib/types.ts`, deterministic scoring in `lib/risk.ts` and `lib/levers.ts`, the Gemini Live config and tools in `lib/live-config.ts`, and scripted calls in `lib/scenarios.ts`. Static assets belong in `public/`.

Next.js views live in `app/`, shared UI in `components/`, the custom backend in `server/`, and unit and Playwright tests in `tests/`. Provider adapters and the call scheduler belong in `server/`. Keep Rosa (protected), Mission Control (guardian), and Diego (relative) views consistent through shared types and server events.

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

Name unit tests `*.test.ts`. Cover risk thresholds, routine-payment friction, lever detection, failed or dodged family words, tool validation, Diego's replies, and approval or timer enforcement. Use Playwright for the cross-view demo flow. No coverage percentage is defined. Targets: all levers within three seconds of the trigger phrase, zero levers on benign calls, Diego's reply on Rosa's screen within two seconds.

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

Prioritize MLH integrations while preserving the core call, family-word, Teller, Diego, voice, and case-file flow. Label live versus simulated features explicitly. Copy `.env.example` to `.env`; never commit credentials or real personal data. Hash safe words, obtain listening consent, and use empathetic warnings that say "no red flags found" rather than "safe".
