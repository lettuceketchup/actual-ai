# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Hot reload with nodemon + ts-node (development)
npm run lint         # ESLint with auto-fix on all *.ts files
npm test             # Run all Jest tests
npm test -- <file>   # Run a single test file (e.g. npm test -- transaction-processor)
npm run prod         # Run compiled output: node dist/app.js
```

## Architecture

Actual AI classifies uncategorized Actual Budget transactions using LLMs. The main processing pipeline:

1. **`app.ts`** — Entry point; sets up cron scheduler, then calls `ActualAiService.classify()`
2. **`src/actual-ai.ts`** (`ActualAiService`) — Orchestrator; optionally syncs accounts, then delegates to `TransactionService`
3. **`src/transaction-service.ts`** — Fetches and filters uncategorized transactions, delegates to `BatchTransactionProcessor`
4. **`src/transaction/batch-transaction-processor.ts`** — Processes transactions in batches of 20
5. **`src/transaction/transaction-processor.ts`** — Per transaction: calls `PromptGenerator` → `LlmService` → routes response to a `ProcessingStrategy`
6. **Processing strategies** (`src/transaction/processing-strategy/`) — Strategy pattern; first match wins:
   - `RuleMatchStrategy` → applies an existing Actual rule
   - `ExistingCategoryStrategy` → assigns an existing category
   - `NewCategoryStrategy` → queues a new category for creation
7. **`src/transaction/category-suggester.ts`** — Creates new category groups/categories at the end of the run
8. **`src/llm-service.ts`** — Rate-limited Vercel AI SDK wrapper; parses structured JSON from LLM responses
9. **`src/llm-model-factory.ts`** — Factory that instantiates the correct Vercel AI SDK model for the configured `LLM_PROVIDER`
10. **`src/prompt-generator.ts`** — Renders `src/templates/prompt.hbs` with categories, rules, and transaction data

**Dependency injection** lives in `src/container.ts` — all services are wired up here.

**Interfaces** are defined in `src/types.ts` (`ActualApiServiceI`, `LlmServiceI`, `ProcessingStrategyI`, `UnifiedResponse`, etc.).

## LLM Response Format

The LLM must return a JSON object matching `UnifiedResponse` (defined in `src/types.ts`):

```typescript
interface UnifiedResponse {
  type: 'existing' | 'new' | 'rule';
  categoryId?: string;       // UUID — required for type 'existing' or 'rule'
  ruleName?: string;         // required for type 'rule'
  newCategory?: {            // required for type 'new'
    name: string;
    groupName: string;
    groupIsNew: boolean;
  };
}
```

## Feature Flags

Controlled via the `FEATURES` env var (JSON array) or `ENABLED_FEATURES` (comma-separated). Registered in `src/config.ts`. Check at runtime with `isFeatureEnabled('name')`.

| Flag | Effect |
|------|--------|
| `classifyOnStartup` | Run on app start |
| `syncAccountsBeforeClassify` | Sync bank accounts before classifying |
| `dryRun` | Log proposed changes without writing (safe default) |
| `suggestNewCategories` | Allow AI to create new categories |
| `rerunMissedTransactions` | Reprocess `#actual-ai-miss` tagged transactions |
| `webSearch` | ValueSerp web search tool (requires `VALUESERP_API_KEY`) |
| `freeWebSearch` | DuckDuckGo web search (no key needed) |
| `disableRateLimiter` | Skip rate limiting (useful for testing) |

## Testing Patterns

Tests use Jest + ts-jest. Test doubles live in `tests/test-doubles/`:
- `InMemoryActualApiService` — full in-memory mock of the Actual Budget API
- `MockedLlmService` — returns controllable responses
- `MockedPromptGenerator` — deterministic prompt output
- `tests/test-doubles/given/given-actual-data.ts` — builder helpers for test fixtures

Feature flag mocking: `jest.spyOn(config, 'isFeatureEnabled').mockReturnValue(true/false)`

## Extending the Codebase

**New LLM provider**: add env vars to `src/config.ts`, a case in `src/llm-model-factory.ts`, and rate limits in `src/utils/provider-limits.ts`.

**New feature flag**: register in `registerStandardFeatures()` or `registerToolFeatures()` in `src/config.ts`.

**New processing strategy**: implement `ProcessingStrategyI` from `src/types.ts`, add to the strategies array in `src/container.ts` (order matters — first match wins).

## Key Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `ACTUAL_SERVER_URL` | — | Required |
| `ACTUAL_PASSWORD` | — | Required |
| `ACTUAL_BUDGET_ID` | — | Required (Sync ID from Settings → Advanced) |
| `LLM_PROVIDER` | `openai` | openai, anthropic, google-generative-ai, ollama, groq, openrouter |
| `FEATURES` | `[]` | JSON array of feature flag names |
| `CLASSIFICATION_SCHEDULE_CRON` | — | Cron expression for scheduled runs |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-4.1-mini` | |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-3-5-sonnet-latest` | |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_GENERATIVE_AI_MODEL` | — / `gemini-1.5-flash` | |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434/api` / `llama3.1` | |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / `llama-3.3-70b-versatile` | |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | — / `deepseek/deepseek-v3.2` | |
| `VALUESERP_API_KEY` | — | Required for `webSearch` feature |
| `PROMPT_TEMPLATE` | `prompt.hbs` | Custom Handlebars template path |
| `GUESSED_TAG` / `NOT_GUESSED_TAG` | `#actual-ai` / `#actual-ai-miss` | Tags applied to transactions |

## Fork & Upstream Sync

This repo is a fork of [sakowicz/actual-ai](https://github.com/sakowicz/actual-ai).

| Remote | URL |
|--------|-----|
| `origin` | https://github.com/lettuceketchup/actual-ai.git (our fork) |
| `upstream` | https://github.com/sakowicz/actual-ai.git (original) |

### Branch strategy

| Branch | Role |
|--------|------|
| `master` | Mirror of `upstream/master` only — **no custom commits here** |
| `pradhumn-personal-setup` | **Working main branch** — all custom code, merges, and feature branches target this |
| `<feature-branches>` | Short-lived; branched from and merged back into `pradhumn-personal-setup` |

### Sync master with upstream (run periodically)

```bash
git checkout master
git fetch upstream
git rebase upstream/master   # master stays a clean mirror
git push origin master
```

### Keep pradhumn-personal-setup updated with master

```bash
git checkout pradhumn-personal-setup
git fetch upstream
git rebase origin/master     # or upstream/master directly
git push origin pradhumn-personal-setup --force-with-lease
```

### Start a new feature branch

Always branch from `pradhumn-personal-setup`, not `master`.

```bash
git checkout pradhumn-personal-setup
git checkout -b my-feature
# ... do work ...
git checkout pradhumn-personal-setup
git merge --no-ff my-feature
git push origin pradhumn-personal-setup
git branch -d my-feature
```

### Rebase a feature branch before merging (resolve conflicts early)

```bash
git checkout my-feature
git fetch upstream
git rebase origin/pradhumn-personal-setup
# Resolve conflicts, then:
git rebase --continue
git push origin my-feature --force-with-lease
```

### Tips to avoid merge conflicts

- Always branch from a freshly synced `pradhumn-personal-setup`, not a stale one.
- Sync `master` ↔ `upstream/master` before rebasing `pradhumn-personal-setup` onto it.
- Never commit custom changes to `master` — it must stay a clean upstream mirror.
- If `package-lock.json` conflicts, accept one side then re-run `npm install` to regenerate it cleanly.
- Rebase feature branches onto `pradhumn-personal-setup` before merging to surface conflicts early.

## Windows Note

The app uses `/tmp/actual-ai/` as its data directory (hardcoded in `src/config.ts`). On Windows with Git Bash, create it manually: `mkdir -p /f/tmp/actual-ai`.
