/**
 * Per-system Settings: the preferences of ONE system (not Central Administration's church-wide
 * settings). Unit details are for the president and secretary; contribution goals and money
 * options are for the treasurer and president.
 */
import { z } from 'zod';

export const DETAILS_EDITORS = ['PRESIDENT', 'SECRETARY'] as const;
export const MONEY_EDITORS = ['TREASURER', 'PRESIDENT'] as const;
export const PAYMENT_METHODS = ['CASH', 'MOMO', 'BANK'] as const;
export const GOAL_PER = ['MEMBER', 'TEAM'] as const;

const text = (max: number) => z.string().trim().max(max).default('');

export const detailsSchema = z.object({
  displayName: text(80),
  meetingDay: text(60),
  place: text(120),
  contactLine: text(120),
});
export type SystemDetails = z.infer<typeof detailsSchema>;

const goalType = z.object({
  code: z.string().trim().min(1).max(24).regex(/^[A-Z0-9_]+$/, 'Use capital letters, digits and _'),
  name: z.string().trim().min(1).max(60),
  goalAmount: z.number().int().min(0).max(1_000_000_000).optional(),
  goalPer: z.enum(GOAL_PER).optional(),
});

export const moneySchema = z
  .object({
    types: z.array(goalType).max(12).default([]),
    methods: z.array(z.enum(PAYMENT_METHODS)).max(3).default(['CASH']),
  })
  .refine((v) => new Set(v.types.map((t) => t.code)).size === v.types.length, { message: 'Each contribution type needs its own code' })
  .refine((v) => v.types.every((t) => (t.goalAmount === undefined) === (t.goalPer === undefined)), {
    message: 'A goal needs both an amount and who it is per',
  });
export type SystemMoneyOptions = z.infer<typeof moneySchema>;

export const EMPTY_DETAILS: SystemDetails = { displayName: '', meetingDay: '', place: '', contactLine: '' };
export const EMPTY_MONEY: SystemMoneyOptions = { types: [], methods: ['CASH'] };

/** Read a stored JSON column, falling back to the empty value when it is missing or no longer valid. */
export function parseStored<T>(raw: string | null | undefined, schema: z.ZodType<T>, empty: T): T {
  try {
    const r = schema.safeParse(JSON.parse(raw ?? '{}'));
    return r.success ? r.data : empty;
  } catch {
    return empty;
  }
}
