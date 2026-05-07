import { Command } from 'commander';

const program = new Command()
  .name('actual-ai')
  .description('Classify Actual Budget transactions using LLMs')
  .option('--no-dry-run', 'Write changes to Actual (dry-run is ON by default)')
  .option('--no-classify-on-startup', 'Skip startup classification (on by default)')
  .option('--rerun-missed', 'Re-classify transactions tagged as missed')
  .option('--suggest-new-categories', 'Allow AI to suggest new categories')
  .option('--sync-accounts', 'Sync bank accounts before classifying')
  .option('--disable-rate-limiter', 'Disable rate limiting')
  .option('--output-file <path>', 'Path for dry-run review XLSX', './actual-ai-review.xlsx')
  .option('--apply-file <path>', 'Apply reviewed XLSX instead of calling LLM')
  .allowUnknownOption()
  .parse(process.argv);

export const cliArgs = program.opts<{
  dryRun: boolean;
  classifyOnStartup: boolean;
  rerunMissed?: boolean;
  suggestNewCategories?: boolean;
  syncAccounts?: boolean;
  disableRateLimiter?: boolean;
  outputFile: string;
  applyFile?: string;
}>();
