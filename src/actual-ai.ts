import {
  ActualAiServiceI, ActualApiServiceI, NotesMigratorI, TransactionServiceI,
  APICategoryGroupEntity,
} from './types';
import suppressConsoleLogsAsync from './utils';
import { formatError } from './utils/error-utils';
import { isFeatureEnabled } from './config';
import ReviewFileService, { ReviewRow } from './review-file-service';

class ActualAiService implements ActualAiServiceI {
  private readonly transactionService: TransactionServiceI;

  private readonly actualApiService: ActualApiServiceI;

  private readonly notesMigrator: NotesMigratorI;

  private readonly reviewFileService: ReviewFileService;

  private readonly isDryRun: boolean;

  constructor(
    transactionService: TransactionServiceI,
    actualApiService: ActualApiServiceI,
    notesMigrator: NotesMigratorI,
    reviewFileService: ReviewFileService,
    isDryRun: boolean,
  ) {
    this.transactionService = transactionService;
    this.actualApiService = actualApiService;
    this.notesMigrator = notesMigrator;
    this.reviewFileService = reviewFileService;
    this.isDryRun = isDryRun;
  }

  public async classify() {
    console.log('Starting classification process');
    let isBudgetOpen = false;
    try {
      await this.actualApiService.initializeApi();
      isBudgetOpen = true;

      try {
        if (isFeatureEnabled('syncAccountsBeforeClassify')) {
          await this.syncAccounts();
        }
      } catch (error) {
        console.error(
          'Bank sync failed, continuing with existing transactions:',
          formatError(error),
        );
      }

      await this.notesMigrator.migrateToTags();

      try {
        await this.transactionService.processTransactions();
      } catch (error) {
        if (this.isRateLimitError(error)) {
          console.error('Rate limit reached during transaction processing. Consider:');
          console.error('1. Adjusting rate limits in provider-limits.ts');
          console.error('2. Switching to a provider with higher limits');
          console.error('3. Breaking your processing into smaller batches');
        } else {
          console.error(
            'An error occurred during transaction processing:',
            formatError(error),
          );
        }
      }
    } catch (error) {
      console.error(
        'An error occurred:',
        formatError(error),
      );
    } finally {
      try {
        if (isBudgetOpen) {
          await this.actualApiService.shutdownApi();
        }
      } catch (shutdownError) {
        console.error('Error during API shutdown:', formatError(shutdownError));
      }
    }
  }

  public async applyFromFile(filePath: string): Promise<void> {
    console.log(`Reading review file: ${filePath}`);
    let rows: ReviewRow[];
    try {
      rows = await this.reviewFileService.readFile(filePath);
    } catch (error) {
      console.error('Failed to read review file:', formatError(error));
      return;
    }
    console.log(`Found ${rows.length} row${rows.length !== 1 ? 's' : ''} to apply`);

    let isBudgetOpen = false;
    try {
      await this.actualApiService.initializeApi();
      isBudgetOpen = true;

      const categoryGroups = await this.actualApiService.getCategoryGroups() as APICategoryGroupEntity[];

      let applied = 0;
      let skipped = 0;

      for (const row of rows) {
        if (!row.category || !row.categoryGroup) {
          console.warn(`Skipping ${row.transactionId}: missing category or group`);
          skipped += 1;
          continue;
        }

        const group = categoryGroups.find(
          (g) => g.name.toLowerCase() === row.categoryGroup.toLowerCase(),
        ) as (APICategoryGroupEntity & { categories?: { id: string; name: string }[] }) | undefined;

        const category = group?.categories?.find(
          (c) => c.name.toLowerCase() === row.category.toLowerCase(),
        );

        if (!category) {
          console.warn(`Category not found: "${row.categoryGroup} > ${row.category}" — skipping ${row.transactionId}`);
          skipped += 1;
          continue;
        }

        // updateTransactionNotesAndCategory respects isDryRun internally
        await this.actualApiService.updateTransactionNotesAndCategory(
          row.transactionId,
          '',
          category.id,
        );
        applied += 1;
      }

      if (this.isDryRun) {
        this.reviewFileService.printApplyPreviewSummary(applied, skipped, filePath);
      } else {
        this.reviewFileService.printApplySummary(applied);
      }
    } catch (error) {
      console.error('An error occurred:', formatError(error));
    } finally {
      try {
        if (isBudgetOpen) {
          await this.actualApiService.shutdownApi();
        }
      } catch (shutdownError) {
        console.error('Error during API shutdown:', formatError(shutdownError));
      }
    }
  }

  async syncAccounts(): Promise<void> {
    console.log('Syncing bank accounts');
    try {
      await suppressConsoleLogsAsync(async () => this.actualApiService.runBankSync());
      console.log('Bank accounts synced');
    } catch (error) {
      console.error(
        'Error syncing bank accounts:',
        formatError(error),
      );
    }
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorStr = formatError(error);
    return errorStr.includes('Rate limit')
           || errorStr.includes('rate limited')
           || errorStr.includes('rate_limit_exceeded')
           || (error instanceof Error
            && 'statusCode' in error
            && (error as unknown as { statusCode: number }).statusCode === 429);
  }
}

export default ActualAiService;
