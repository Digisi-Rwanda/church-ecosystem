import {
  BALANCE_SHEET_LINES,
  BUDGET_LINES,
  SERVICE_COLLECTIONS,
} from '../data/churchFinanceSeed';
import { FINANCE_TXNS, pushFinanceTxn } from '../data/financeSeed';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import type {
  BalanceSheetLine,
  BalanceSheetSection,
  BudgetLine,
  FinanceCategory,
  FinanceTransaction,
  ServiceCollection,
} from '../domain/types';
import { financeService } from './financeService';

const GENERAL_FUND = 'fund-general';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export const CATEGORY_LABELS: Record<FinanceCategory, string> = {
  TITHE: 'Tithe',
  OFFERING: 'Offering',
  GIVING: 'Giving',
  UTILITIES: 'Utilities',
  SALARIES: 'Salaries',
  MISSIONS: 'Missions',
  MAINTENANCE: 'Maintenance',
  ADMIN: 'Administration',
  OTHER_INCOME: 'Other income',
  OTHER_EXPENSE: 'Other expense',
};

export const churchFinanceService = {
  canManageGeneral(personId: string): boolean {
    return financeService.authorizeFund(personId, GENERAL_FUND, 'MANAGE')
      .allowed;
  },

  canViewGeneral(personId: string): boolean {
    return financeService.authorizeFund(personId, GENERAL_FUND, 'VIEW')
      .allowed;
  },

  listCollections(): ServiceCollection[] {
    return [...SERVICE_COLLECTIONS].sort((a, b) =>
      b.serviceDate.localeCompare(a.serviceDate),
    );
  },

  collectionTotal(c: ServiceCollection): number {
    return c.titheAmount + c.offeringAmount + c.givingAmount;
  },

  /**
   * Create and post a service collection → General Fund income lines.
   */
  postServiceCollection(input: {
    actorPersonId: string;
    serviceDate: string;
    serviceLabel: string;
    titheAmount: number;
    offeringAmount: number;
    givingAmount: number;
    notes?: string;
  }): { ok: boolean; reason?: string; collection?: ServiceCollection } {
    if (!this.canManageGeneral(input.actorPersonId)) {
      return {
        ok: false,
        reason: 'General Fund MANAGE required (Church Treasurer)',
      };
    }
    const tithe = Math.max(0, Math.round(input.titheAmount));
    const offering = Math.max(0, Math.round(input.offeringAmount));
    const giving = Math.max(0, Math.round(input.givingAmount));
    if (tithe + offering + giving <= 0) {
      return { ok: false, reason: 'Enter at least one amount' };
    }

    const id = uid('sc');
    const txnIds: string[] = [];
    const parts: Array<{
      amount: number;
      category: FinanceCategory;
      label: string;
    }> = [
      { amount: tithe, category: 'TITHE', label: 'Tithe' },
      { amount: offering, category: 'OFFERING', label: 'Offering' },
      { amount: giving, category: 'GIVING', label: 'Giving' },
    ];

    for (const part of parts) {
      if (part.amount <= 0) continue;
      const txnId = uid(`txn-gen-${part.category.toLowerCase()}`);
      pushFinanceTxn({
        id: txnId,
        fundId: GENERAL_FUND,
        type: 'INCOME',
        amount: part.amount,
        description: `${input.serviceLabel} · ${part.label}`,
        occurredOn: input.serviceDate,
        recordedByPersonId: input.actorPersonId,
        category: part.category,
      });
      txnIds.push(txnId);
    }

    const collection: ServiceCollection = {
      id,
      serviceDate: input.serviceDate,
      serviceLabel: input.serviceLabel,
      titheAmount: tithe,
      offeringAmount: offering,
      givingAmount: giving,
      notes: input.notes,
      status: 'POSTED',
      recordedByPersonId: input.actorPersonId,
      postedAt: new Date().toISOString(),
      txnIds,
    };
    SERVICE_COLLECTIONS.unshift(collection);
    scheduleLocalDomainPersist();
    return { ok: true, collection };
  },

  recordExpense(input: {
    actorPersonId: string;
    amount: number;
    category: FinanceCategory;
    description: string;
    occurredOn: string;
  }): { ok: boolean; reason?: string; txnId?: string } {
    if (!this.canManageGeneral(input.actorPersonId)) {
      return { ok: false, reason: 'General Fund MANAGE required' };
    }
    const amount = Math.max(0, Math.round(input.amount));
    if (amount <= 0) return { ok: false, reason: 'Amount required' };
    const txnId = uid('txn-gen-exp');
    pushFinanceTxn({
      id: txnId,
      fundId: GENERAL_FUND,
      type: 'EXPENSE',
      amount,
      description: input.description,
      occurredOn: input.occurredOn,
      recordedByPersonId: input.actorPersonId,
      category: input.category,
    });
    return { ok: true, txnId };
  },

  generalTxns(): FinanceTransaction[] {
    return FINANCE_TXNS.filter((t) => t.fundId === GENERAL_FUND).sort((a, b) =>
      b.occurredOn.localeCompare(a.occurredOn),
    );
  },

  /** Rollups from posted collections. */
  collectionRollups(): {
    byService: Array<{
      id: string;
      serviceDate: string;
      serviceLabel: string;
      tithe: number;
      offering: number;
      giving: number;
      total: number;
    }>;
    byWeek: Array<{
      week: string;
      tithe: number;
      offering: number;
      giving: number;
      total: number;
    }>;
    byMonth: Array<{
      month: string;
      tithe: number;
      offering: number;
      giving: number;
      total: number;
    }>;
  } {
    const posted = SERVICE_COLLECTIONS.filter((c) => c.status === 'POSTED');
    const byService = posted.map((c) => ({
      id: c.id,
      serviceDate: c.serviceDate,
      serviceLabel: c.serviceLabel,
      tithe: c.titheAmount,
      offering: c.offeringAmount,
      giving: c.givingAmount,
      total: this.collectionTotal(c),
    }));

    const weekMap = new Map<
      string,
      { tithe: number; offering: number; giving: number }
    >();
    const monthMap = new Map<
      string,
      { tithe: number; offering: number; giving: number }
    >();

    for (const c of posted) {
      const w = isoWeekKey(c.serviceDate);
      const m = monthKey(c.serviceDate);
      const week = weekMap.get(w) ?? { tithe: 0, offering: 0, giving: 0 };
      week.tithe += c.titheAmount;
      week.offering += c.offeringAmount;
      week.giving += c.givingAmount;
      weekMap.set(w, week);
      const month = monthMap.get(m) ?? { tithe: 0, offering: 0, giving: 0 };
      month.tithe += c.titheAmount;
      month.offering += c.offeringAmount;
      month.giving += c.givingAmount;
      monthMap.set(m, month);
    }

    return {
      byService,
      byWeek: [...weekMap.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([week, v]) => ({
          week,
          ...v,
          total: v.tithe + v.offering + v.giving,
        })),
      byMonth: [...monthMap.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, v]) => ({
          month,
          ...v,
          total: v.tithe + v.offering + v.giving,
        })),
    };
  },

  listBudgets(fiscalYear?: number): BudgetLine[] {
    return BUDGET_LINES.filter((b) =>
      fiscalYear ? b.fiscalYear === fiscalYear : true,
    ).sort((a, b) => a.label.localeCompare(b.label));
  },

  upsertBudget(input: Omit<BudgetLine, 'id'> & { id?: string }): BudgetLine {
    if (input.id) {
      const i = BUDGET_LINES.findIndex((b) => b.id === input.id);
      if (i >= 0) {
        BUDGET_LINES[i] = { ...BUDGET_LINES[i], ...input, id: input.id };
        return BUDGET_LINES[i];
      }
    }
    const line: BudgetLine = {
      id: uid('bud'),
      fiscalYear: input.fiscalYear,
      month: input.month,
      category: input.category,
      kind: input.kind,
      budgetedAmount: input.budgetedAmount,
      label: input.label,
      notes: input.notes,
    };
    BUDGET_LINES.unshift(line);
    scheduleLocalDomainPersist();
    return line;
  },

  actualForCategory(
    category: FinanceCategory,
    fiscalYear: number,
    month?: number,
  ): number {
    return this.generalTxns()
      .filter((t) => {
        if (t.category !== category) return false;
        const y = Number(t.occurredOn.slice(0, 4));
        if (y !== fiscalYear) return false;
        if (month != null && Number(t.occurredOn.slice(5, 7)) !== month)
          return false;
        return true;
      })
      .reduce((sum, t) => {
        if (t.type === 'INCOME' || t.type === 'TRANSFER_IN') return sum + t.amount;
        return sum + t.amount;
      }, 0);
  },

  budgetVsActual(fiscalYear: number): Array<{
    line: BudgetLine;
    actual: number;
    variance: number;
  }> {
    return this.listBudgets(fiscalYear).map((line) => {
      const actual = this.actualForCategory(
        line.category,
        fiscalYear,
        line.month,
      );
      const variance =
        line.kind === 'INCOME'
          ? actual - line.budgetedAmount
          : line.budgetedAmount - actual;
      return { line, actual, variance };
    });
  },

  listBalanceSheet(asOfDate?: string): BalanceSheetLine[] {
    const date = asOfDate ?? '2026-09-08';
    return BALANCE_SHEET_LINES.filter((l) => l.asOfDate === date);
  },

  upsertBalanceSheetLine(
    input: Omit<BalanceSheetLine, 'id'> & { id?: string },
  ): BalanceSheetLine {
    if (input.id) {
      const i = BALANCE_SHEET_LINES.findIndex((b) => b.id === input.id);
      if (i >= 0) {
        BALANCE_SHEET_LINES[i] = {
          ...BALANCE_SHEET_LINES[i],
          ...input,
          id: input.id,
        };
        return BALANCE_SHEET_LINES[i];
      }
    }
    const line: BalanceSheetLine = {
      id: uid('bs'),
      asOfDate: input.asOfDate,
      section: input.section,
      label: input.label,
      amount: input.amount,
      notes: input.notes,
      linkedFundId: input.linkedFundId,
    };
    BALANCE_SHEET_LINES.unshift(line);
    scheduleLocalDomainPersist();
    return line;
  },

  resolvedBalanceSheet(asOfDate?: string): {
    asOfDate: string;
    lines: Array<BalanceSheetLine & { resolvedAmount: number }>;
    totals: Record<BalanceSheetSection, number>;
    balanced: boolean;
  } {
    const date = asOfDate ?? '2026-09-08';
    const raw = this.listBalanceSheet(date);
    const lines = raw.map((l) => {
      let resolvedAmount = l.amount;
      if (l.linkedFundId) {
        resolvedAmount = financeService.balance(l.linkedFundId);
      }
      return { ...l, resolvedAmount };
    });

    const assets = lines
      .filter((l) => l.section === 'ASSET')
      .reduce((s, l) => s + l.resolvedAmount, 0);
    const liabilities = lines
      .filter((l) => l.section === 'LIABILITY')
      .reduce((s, l) => s + l.resolvedAmount, 0);
    const equityLines = lines.filter((l) => l.section === 'EQUITY');
    let equity = equityLines.reduce((s, l) => s + l.resolvedAmount, 0);
    const computedEquity = assets - liabilities;
    if (equity === 0 && equityLines.length > 0) {
      equity = computedEquity;
      for (const l of lines) {
        if (l.section === 'EQUITY' && l.amount === 0 && !l.linkedFundId) {
          l.resolvedAmount = computedEquity;
        }
      }
    }

    return {
      asOfDate: date,
      lines,
      totals: {
        ASSET: assets,
        LIABILITY: liabilities,
        EQUITY: equity,
      },
      balanced: Math.abs(assets - (liabilities + equity)) < 1,
    };
  },

  incomeStatement(from: string, to: string): {
    income: Array<{ category: string; amount: number }>;
    expense: Array<{ category: string; amount: number }>;
    totalIncome: number;
    totalExpense: number;
    net: number;
  } {
    const txns = this.generalTxns().filter(
      (t) => t.occurredOn >= from && t.occurredOn <= to,
    );
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const t of txns) {
      const cat = t.category ?? 'OTHER';
      if (t.type === 'INCOME' || t.type === 'TRANSFER_IN') {
        incomeMap.set(cat, (incomeMap.get(cat) ?? 0) + t.amount);
      } else {
        expenseMap.set(cat, (expenseMap.get(cat) ?? 0) + t.amount);
      }
    }
    const income = [...incomeMap.entries()].map(([category, amount]) => ({
      category,
      amount,
    }));
    const expense = [...expenseMap.entries()].map(([category, amount]) => ({
      category,
      amount,
    }));
    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  },
};
