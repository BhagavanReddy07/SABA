# Contributing to SABA

Thanks for your interest! The workflow is the standard fork/branch + pull request
model. Direct pushes to `main` are blocked — every change lands through a PR
reviewed by the repository owner, and `main` auto-deploys to production
([saba-assistant.vercel.app](https://saba-assistant.vercel.app)) on merge.

## Workflow

1. **Fork** this repo (or clone it if you have access):
   ```bash
   git clone https://github.com/BhagavanReddy07/SABA.git
   cd SABA
   npm install
   ```
2. **Set up your environment** — follow "Running it on your machine" in the
   [README](README.md). You'll need your own free API keys (Groq/Gemini); secrets
   are never committed.
3. **Create a branch** off `main`:
   ```bash
   git checkout -b feat/short-description
   ```
   Prefixes: `feat/`, `fix/`, `docs/`, `chore/`.
4. **Make your changes.** Before pushing, make sure these pass:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
5. **Push and open a Pull Request** against `main`. Fill in the PR template.
   Vercel automatically attaches a **preview deployment** to your PR so the
   change can be tried live before merging.
6. **Review & merge** — the owner reviews every PR. Once approved and merged,
   `main` deploys to production automatically.

## Ground rules

- Keep PRs small and focused — one feature or fix per PR.
- No new paid dependencies or services; everything in SABA runs on free tiers.
- Match the existing code style (TypeScript, Tailwind, no ORM, minimal deps).
- Never commit secrets — `.env` is gitignored for a reason.
