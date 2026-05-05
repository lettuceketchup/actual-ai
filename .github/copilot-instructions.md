# Copilot Instructions for Actual AI

## Project Overview

**Actual AI** is an automated transaction categorization service for [Actual Budget](https://actualbudget.org/). It uses Large Language Models (LLMs) to classify uncategorized bank transactions into appropriate budget categories.

### Tech Stack
- **Language**: TypeScript (Node.js 20+)
- **Testing**: Jest
- **AI SDK**: Vercel AI SDK (`ai` package)
- **Supported LLM Providers**: OpenAI, Anthropic, Google Generative AI, Ollama, Groq
- **Template Engine**: Handlebars (for prompts)
- **Actual Budget API**: `@actual-app/api`

---

## Architecture

### Core Components

```
app.ts                    → Entry point, cron scheduler
src/
├── actual-ai.ts          → Main orchestrator (ActualAiService)
├── container.ts          → Dependency injection container
├── config.ts             → Environment configuration & feature flags
├── transaction-service.ts → Transaction processing coordinator
├── llm-service.ts        → LLM communication layer
├── llm-model-factory.ts  → Factory for creating LLM model instances
├── prompt-generator.ts   → Handlebars prompt generation
├── actual-api-service.ts → Actual Budget API wrapper
├── similarity-calculator.ts → Category similarity scoring
├── category-suggestion-optimizer.ts → Deduplicates suggested categories
├── transaction/
│   ├── batch-transaction-processor.ts → Processes transactions in batches
│   ├── transaction-processor.ts → Single transaction processing
│   ├── transaction-filterer.ts → Filters uncategorized transactions
│   ├── category-suggester.ts → Creates new categories
│   ├── tag-service.ts → Manages #actual-ai tags
│   ├── notes-migrator.ts → Migrates old note format to tags
│   └── processing-strategy/
│       ├── existing-category-strategy.ts → Assigns existing categories
│       ├── new-category-strategy.ts → Handles new category suggestions
│       └── rule-match-strategy.ts → Applies existing rules
├── utils/
│   ├── rate-limiter.ts → Provider-specific rate limiting
│   ├── provider-limits.ts → Rate limit configurations
│   ├── tool-service.ts → Web search tool integration
│   ├── free-web-search-service.ts → DuckDuckGo search
│   ├── json-utils.ts → LLM response parsing
│   ├── error-utils.ts → Error formatting
│   └── rule-utils.ts → Transaction rule utilities
├── templates/
│   └── prompt.hbs → Main categorization prompt template
└── exceptions/
    └── prompt-template-exception.ts
```

### Key Interfaces (src/types.ts)

- `ActualApiServiceI` - Actual Budget API operations
- `LlmServiceI` - LLM communication
- `TransactionServiceI` - Transaction processing
- `ProcessingStrategyI` - Strategy pattern for handling LLM responses
- `UnifiedResponse` - Standardized LLM response format

### Processing Flow

1. `ActualAiService.classify()` starts the process
2. Optionally syncs bank accounts
3. `TransactionService.processTransactions()` fetches and filters transactions
4. `BatchTransactionProcessor` processes in batches of 20
5. For each transaction:
   - `PromptGenerator` creates the prompt with transaction + categories
   - `LlmService` sends to LLM and parses response
   - Processing strategies handle the response type (existing/new/rule)
6. `CategorySuggester` creates new categories if enabled

---

## Feature Flags

Feature flags are defined in `src/config.ts` and controlled via the `FEATURES` environment variable (JSON array):

| Feature | Description |
|---------|-------------|
| `classifyOnStartup` | Run classification when app starts |
| `syncAccountsBeforeClassify` | Sync bank accounts first |
| `dryRun` | Preview changes without modifying data |
| `suggestNewCategories` | Allow AI to create new categories |
| `rerunMissedTransactions` | Re-process `#actual-ai-miss` transactions |
| `webSearch` | Enable ValueSerp web search |
| `freeWebSearch` | Enable DuckDuckGo web search |
| `disableRateLimiter` | Disable API rate limiting |

---

## LLM Response Format

The LLM must respond with a JSON object matching `UnifiedResponse`:

```typescript
interface UnifiedResponse {
  type: 'existing' | 'new' | 'rule';
  categoryId?: string;      // UUID for existing category or rule
  ruleName?: string;        // Rule name if type='rule'
  newCategory?: {           // Required if type='new'
    name: string;
    groupName: string;
    groupIsNew: boolean;
  };
}
```

---

## Development Guidelines

### Running Tests
```bash
npm test                    # Run all tests
npm run lint               # Run ESLint with auto-fix
npm run dev                # Run with nodemon (hot reload)
```

### Running Locally
```bash
# Required environment variables
export ACTUAL_SERVER_URL=http://localhost:5006
export ACTUAL_PASSWORD=your_password
export ACTUAL_BUDGET_ID=your_budget_sync_id
export LLM_PROVIDER=ollama  # or openai, anthropic, google-generative-ai, groq
export FEATURES='["classifyOnStartup", "dryRun"]'

# Provider-specific (example for Ollama)
export OLLAMA_MODEL=llama3.1
export OLLAMA_BASE_URL=http://localhost:11434/api

npm run dev
```

### Windows Compatibility
- The app uses `/tmp/actual-ai/` as data directory (hardcoded in config.ts)
- On Windows with Git Bash, create the directory manually: `mkdir -p /f/tmp/actual-ai`

### Adding a New LLM Provider
1. Add configuration variables to `src/config.ts`
2. Add provider case in `src/llm-model-factory.ts`
3. Add rate limits in `src/utils/provider-limits.ts`

### Adding a New Feature Flag
1. Register in `registerStandardFeatures()` or `registerToolFeatures()` in `src/config.ts`
2. Use `isFeatureEnabled('featureName')` to check

### Adding a New Processing Strategy
1. Implement `ProcessingStrategyI` interface
2. Add to strategies array in `src/container.ts`
3. Strategy order matters - first match wins

---

## Testing Patterns

### Test Doubles Location
- `tests/test-doubles/` - Mock implementations
- `tests/test-doubles/given/` - Test data builders

### Common Mocks
- `InMemoryActualApiService` - In-memory Actual API
- `MockedLlmService` - Controllable LLM responses
- `MockedPromptGenerator` - Predictable prompts

---

## Common Issues & Solutions

### "Could not find category in LLM response"
- Model not returning valid JSON with UUID
- Solution: Use a model better at instruction following (llama3.1, mistral, gpt-4o-mini)
- Check Ollama logs for context window issues

### Rate Limit Errors
- Adjust limits in `src/utils/provider-limits.ts`
- Enable `disableRateLimiter` for testing
- Use provider with higher limits

### Windows Path Issues
- Create `/tmp/actual-ai/` directory manually
- Or modify `dataDir` in `src/config.ts`

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACTUAL_SERVER_URL` | Yes | - | Actual Budget server URL |
| `ACTUAL_PASSWORD` | Yes | - | Server password |
| `ACTUAL_BUDGET_ID` | Yes | - | Budget Sync ID |
| `ACTUAL_E2E_PASSWORD` | No | - | E2E encryption password |
| `LLM_PROVIDER` | No | `openai` | LLM provider name |
| `FEATURES` | No | `[]` | JSON array of feature flags |
| `CLASSIFICATION_SCHEDULE_CRON` | No | - | Cron schedule expression |
| `PROMPT_TEMPLATE` | No | prompt.hbs | Custom Handlebars template |
| `GUESSED_TAG` | No | `#actual-ai` | Tag for classified transactions |
| `NOT_GUESSED_TAG` | No | `#actual-ai-miss` | Tag for unclassified |
| `OPENAI_API_KEY` | Conditional | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `ANTHROPIC_API_KEY` | Conditional | - | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-3-5-sonnet-latest` | Anthropic model |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Conditional | - | Google AI API key |
| `GOOGLE_GENERATIVE_AI_MODEL` | No | `gemini-1.5-flash` | Google AI model |
| `OLLAMA_BASE_URL` | Conditional | `http://localhost:11434/api` | Ollama API URL |
| `OLLAMA_MODEL` | No | `llama3.1` | Ollama model |
| `GROQ_API_KEY` | Conditional | - | Groq API key |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model |
| `VALUESERP_API_KEY` | No | - | ValueSerp API key for web search |
