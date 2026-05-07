import ExcelJS from 'exceljs';
import { TransactionEntity } from '@actual-app/core/src/types/models';
import { APIAccountEntity } from '@actual-app/core/src/server/api-models';
import {
  APICategoryEntity, APICategoryGroupEntity, UnifiedResponse,
} from './types';

interface ReviewRecord {
  transaction: TransactionEntity;
  response: UnifiedResponse;
  categoryName: string;
  groupName: string;
  accountName: string;
}

export interface ReviewRow {
  transactionId: string;
  categoryGroup: string;
  category: string;
  type: string;
  ruleName?: string;
}

const COLS = {
  DATE: 1,
  ACCOUNT: 2,
  PAYEE: 3,
  AMOUNT: 4,
  NOTES: 5,
  CATEGORY_GROUP: 6,
  CATEGORY: 7,
  TYPE: 8,
  RULE_NAME: 9,
  TRANSACTION_ID: 10,
};

const READ_ONLY_COLS = [
  COLS.DATE, COLS.ACCOUNT, COLS.PAYEE, COLS.AMOUNT,
  COLS.NOTES, COLS.TYPE, COLS.RULE_NAME, COLS.TRANSACTION_ID,
];

const FILL_READ_ONLY: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' },
};
const FILL_NEW: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' },
};
const FILL_HEADER: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' },
};

class ReviewFileService {
  private records: ReviewRecord[] = [];

  record(
    transaction: TransactionEntity,
    response: UnifiedResponse,
    categories: (APICategoryEntity | APICategoryGroupEntity)[],
    categoryGroups: APICategoryGroupEntity[],
    accounts: APIAccountEntity[],
  ): void {
    let categoryName = '';
    let groupName = '';

    if (response.type === 'new' && response.newCategory) {
      categoryName = response.newCategory.name;
      groupName = response.newCategory.groupName;
    } else if (response.categoryId) {
      const category = categories.find((c) => c.id === response.categoryId) as APICategoryEntity | undefined;
      if (category) {
        categoryName = category.name ?? '';
        const group = categoryGroups.find(
          (g) => g.id === (category as { group_id?: string }).group_id,
        );
        groupName = group?.name ?? '';
      }
    }

    const account = accounts.find((a) => a.id === transaction.account);
    const accountName = account?.name ?? transaction.account;

    this.records.push({
      transaction, response, categoryName, groupName, accountName,
    });
  }

  async writeFile(outputPath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Review');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 13 },
      { header: 'Account', key: 'account', width: 22 },
      { header: 'Payee', key: 'payee', width: 45 },
      { header: 'Amount', key: 'amount', width: 13 },
      { header: 'Current Notes', key: 'notes', width: 30 },
      { header: 'Category Group', key: 'categoryGroup', width: 25 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Type', key: 'type', width: 11 },
      { header: 'Rule Name', key: 'ruleName', width: 25 },
      { header: 'Transaction ID', key: 'transactionId', width: 38 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = FILL_HEADER;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const record of this.records) {
      const isNew = record.response.type === 'new';
      const row = sheet.addRow({
        date: record.transaction.date,
        account: record.accountName,
        payee: record.transaction.imported_payee ?? record.transaction.payee ?? '',
        amount: record.transaction.amount / 100,
        notes: record.transaction.notes ?? '',
        categoryGroup: record.groupName,
        category: record.categoryName,
        type: record.response.type,
        ruleName: record.response.ruleName ?? '',
        transactionId: record.transaction.id,
      });

      row.getCell(COLS.AMOUNT).numFmt = '#,##0.00';

      const fill = isNew ? FILL_NEW : FILL_READ_ONLY;
      READ_ONLY_COLS.forEach((col) => {
        row.getCell(col).fill = fill;
      });

      if (isNew) {
        row.getCell(COLS.CATEGORY_GROUP).fill = FILL_NEW;
        row.getCell(COLS.CATEGORY).fill = FILL_NEW;
      }
    }

    await workbook.xlsx.writeFile(outputPath);
  }

  async readFile(inputPath: string): Promise<ReviewRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const sheet = workbook.getWorksheet('Review');
    if (!sheet) throw new Error(`Sheet "Review" not found in ${inputPath}`);

    const rows: ReviewRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const transactionId = String(row.getCell(COLS.TRANSACTION_ID).value ?? '').trim();
      if (!transactionId) return;
      rows.push({
        transactionId,
        categoryGroup: String(row.getCell(COLS.CATEGORY_GROUP).value ?? '').trim(),
        category: String(row.getCell(COLS.CATEGORY).value ?? '').trim(),
        type: String(row.getCell(COLS.TYPE).value ?? '').trim(),
        ruleName: String(row.getCell(COLS.RULE_NAME).value ?? '').trim() || undefined,
      });
    });
    return rows;
  }

  printDryRunSummary(outputPath: string): void {
    const n = this.records.length;
    const newCount = this.records.filter((r) => r.response.type === 'new').length;
    const box = '═'.repeat(62);
    console.log(`\n╔${box}╗`);
    console.log(`║  Dry-run complete — ${n} transaction${n !== 1 ? 's' : ''} classified${' '.repeat(Math.max(0, 40 - String(n).length))}║`);
    console.log(`║  Review file: ${outputPath}${' '.repeat(Math.max(0, 47 - outputPath.length))}║`);
    console.log(`╚${box}╝`);
    console.log('\nNext steps:');
    console.log(`  1. Open and review:  ${outputPath}`);
    console.log('     • Edit "Category Group" / "Category" columns to correct misclassifications');
    console.log('     • Delete rows you want to skip entirely');
    if (newCount > 0) {
      console.log(`     • ${newCount} yellow row${newCount !== 1 ? 's' : ''} = new categories the AI wants to create`);
    }
    console.log('\n  2. Apply your reviewed file:');
    console.log(`     npm run prod -- --apply-file ${outputPath} --no-dry-run`);
    console.log('\n  Tip: Preview the apply first (dry-run):');
    console.log(`     npm run prod -- --apply-file ${outputPath}\n`);
  }

  printApplyPreviewSummary(applied: number, skipped: number, outputPath: string): void {
    const box = '═'.repeat(62);
    console.log(`\n╔${box}╗`);
    console.log(`║  Apply preview (dry-run) — ${applied} transaction${applied !== 1 ? 's' : ''} would be updated${' '.repeat(Math.max(0, 33 - String(applied).length))}║`);
    if (skipped > 0) {
      console.log(`║  ${skipped} row${skipped !== 1 ? 's' : ''} skipped (category not found — see warnings above)${' '.repeat(Math.max(0, 14 - String(skipped).length))}║`);
    }
    console.log(`╚${box}╝`);
    console.log('\nTo write these changes to Actual:');
    console.log(`     npm run prod -- --apply-file ${outputPath} --no-dry-run\n`);
  }

  printApplySummary(applied: number): void {
    const box = '═'.repeat(62);
    console.log(`\n╔${box}╗`);
    console.log(`║  Done — ${applied} transaction${applied !== 1 ? 's' : ''} categorized in Actual Budget${' '.repeat(Math.max(0, 34 - String(applied).length))}║`);
    console.log(`╚${box}╝`);
    console.log('\nRun again to classify any remaining uncategorized transactions:');
    console.log('     npm run prod\n');
  }

  get count(): number {
    return this.records.length;
  }
}

export default ReviewFileService;
