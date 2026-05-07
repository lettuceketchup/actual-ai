import type {
  TransactionEntity,
} from '@actual-app/core/src/types/models';
import type {
  ActualApiServiceI,
  TransactionServiceI,
} from './types';
import { isFeatureEnabled, outputFile } from './config';
import CategorySuggester from './transaction/category-suggester';
import BatchTransactionProcessor from './transaction/batch-transaction-processor';
import TransactionFilterer from './transaction/transaction-filterer';
import ReviewFileService from './review-file-service';

class TransactionService implements TransactionServiceI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly categorySuggester: CategorySuggester;

  private readonly transactionProcessor: BatchTransactionProcessor;

  private readonly transactionFilterer: TransactionFilterer;

  private readonly isDryRun: boolean;

  private readonly reviewFileService?: ReviewFileService;

  constructor(
    actualApiClient: ActualApiServiceI,
    categorySuggester: CategorySuggester,
    transactionProcessor: BatchTransactionProcessor,
    transactionFilterer: TransactionFilterer,
    isDryRun: boolean,
    reviewFileService?: ReviewFileService,
  ) {
    this.actualApiService = actualApiClient;
    this.categorySuggester = categorySuggester;
    this.transactionProcessor = transactionProcessor;
    this.transactionFilterer = transactionFilterer;
    this.isDryRun = isDryRun;
    this.reviewFileService = reviewFileService;
  }

  async processTransactions(): Promise<void> {
    if (this.isDryRun) {
      console.log('=== DRY RUN MODE ===');
      console.log('No changes will be made to transactions or categories');
      console.log('=====================');
    }

    const [categoryGroups, categories, payees, transactions, accounts, rules] = await Promise.all([
      this.actualApiService.getCategoryGroups(),
      this.actualApiService.getCategories(),
      this.actualApiService.getPayees(),
      this.actualApiService.getTransactions(),
      this.actualApiService.getAccounts(),
      this.actualApiService.getRules(),
    ]);
    console.log(`Found ${rules.length} transaction categorization rules`);
    console.log('rerunMissedTransactions', isFeatureEnabled('rerunMissedTransactions'));

    const uncategorizedTransactions = this.transactionFilterer.filterUncategorized(
      transactions,
      accounts,
    );

    if (uncategorizedTransactions.length === 0) {
      console.log('No uncategorized transactions to process');
      return;
    }

    // Track suggested new categories
    const suggestedCategories = new Map<string, {
      name: string;
      groupName: string;
      groupIsNew: boolean;
      groupId?: string;
      transactions: TransactionEntity[];
    }>();

    await this.transactionProcessor.process(
      uncategorizedTransactions,
      categoryGroups,
      payees,
      rules,
      categories,
      suggestedCategories,
      accounts,
    );

    if (this.isDryRun && this.reviewFileService && this.reviewFileService.count > 0) {
      await this.reviewFileService.writeFile(outputFile);
      this.reviewFileService.printDryRunSummary(outputFile);
    }

    // Create new categories if not in dry run mode
    if (!this.isDryRun && isFeatureEnabled('suggestNewCategories') && suggestedCategories.size > 0) {
      await this.categorySuggester.suggest(
        suggestedCategories,
        uncategorizedTransactions,
        categoryGroups,
      );
    }
  }
}

export default TransactionService;
