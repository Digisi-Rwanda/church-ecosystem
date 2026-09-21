import type {
  BalanceSheetLine,
  BudgetLine,
  ServiceCollection,
} from '../domain/types';

/** Posted Sunday collections (demo clock: Sep 2026). */
export let SERVICE_COLLECTIONS: ServiceCollection[] = [];

export let BUDGET_LINES: BudgetLine[] = [];

/** Manual BS lines + linked cash from General Fund. */
export let BALANCE_SHEET_LINES: BalanceSheetLine[] = [];
