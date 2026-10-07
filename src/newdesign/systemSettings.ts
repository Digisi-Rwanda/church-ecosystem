import type { MoneyType, SystemMoneyOptions } from '../api/frontDoorApi';

export const MAX_TYPES = 12;

/** A suggested code for a new contribution type, from its name: capitals, digits and underscores. */
export function suggestTypeCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

/** What the form holds while it is being edited: the goal is typed as text. */
export type TypeDraft = { code: string; name: string; goalAmount: string; goalPer: '' | 'MEMBER' | 'TEAM' };

export const toDraft = (t: MoneyType): TypeDraft => ({ code: t.code, name: t.name, goalAmount: t.goalAmount === undefined ? '' : String(t.goalAmount), goalPer: t.goalPer ?? '' });

/** The first thing wrong with the list, as a message key, or null when it can be saved. */
export function typesProblem(drafts: TypeDraft[]): string | null {
  const codes = new Set<string>();
  for (const d of drafts) {
    if (!d.name.trim()) return 'door.sset.err.name';
    const code = d.code.trim() || suggestTypeCode(d.name);
    if (!/^[A-Z0-9_]{1,24}$/.test(code)) return 'door.sset.err.code';
    if (codes.has(code)) return 'door.sset.err.duplicate';
    codes.add(code);
    const hasAmount = d.goalAmount.trim() !== '';
    if (hasAmount && !/^\d{1,10}$/.test(d.goalAmount.trim())) return 'door.sset.err.amount';
    if (hasAmount !== (d.goalPer !== '')) return 'door.sset.err.goal';
  }
  return drafts.length > MAX_TYPES ? 'door.sset.err.tooMany' : null;
}

/** The list the server takes: codes filled in, goals only where both parts are given. */
export function cleanTypes(drafts: TypeDraft[]): MoneyType[] {
  return drafts.map((d) => {
    const base = { code: d.code.trim() || suggestTypeCode(d.name), name: d.name.trim() };
    return d.goalAmount.trim() !== '' && d.goalPer !== '' ? { ...base, goalAmount: Number(d.goalAmount.trim()), goalPer: d.goalPer } : base;
  });
}

export const cleanMoney = (drafts: TypeDraft[], methods: SystemMoneyOptions['methods']): SystemMoneyOptions => ({
  types: cleanTypes(drafts),
  methods: methods.length ? methods : ['CASH'],
});
