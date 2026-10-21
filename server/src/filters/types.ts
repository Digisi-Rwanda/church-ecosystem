/**
 * Shared filter framework: the shapes every module (People now; Tasks, Events, Projects, Programs later) uses.
 * A module describes its fields once, in a registry; requests only ever name registry keys and operators, never
 * database columns, so nothing a client sends can become a Prisma field name, a path or a SQL fragment.
 */
import type { z } from 'zod';

/** Operators a field type offers. Positive operators never match a missing value; negative ones (isNot, isNone, noneMatch, includesNone) do. */
export const OPERATORS = {
  text: ['contains', 'equals', 'startsWith'],
  choice: ['is', 'isNot', 'isAny', 'isNone'],
  ordinal: ['is', 'isAny', 'isNone', 'atLeast', 'atMost'],
  number: ['equals', 'atLeast', 'atMost', 'between'],
  date: ['on', 'before', 'after', 'between', 'withinLast', 'withinNext'],
  boolean: ['isYes', 'isNo'],
  multi: ['includesAny', 'includesNone'],
  records: ['anyMatch', 'noneMatch'],
} as const;
export type FieldType = keyof typeof OPERATORS;

/** Limits applied to every request before anything is evaluated. */
export const LIMITS = {
  conditions: 12, groups: 4, listValues: 20, stringLength: 80, pageSize: 100, defaultPageSize: 50, maxOffset: 100_000, amountMax: 3660,
} as const;

export interface FieldDef<Row, Ctx, Viewer> {
  key: string;
  type: FieldType;
  /** Whether this viewer may use the field at all: in a condition, as a sort, and in the schema they are shown. */
  allowed: (viewer: Viewer) => boolean;
  /** The row's value(s): a scalar, a list (any of them counts) or null/undefined when missing. */
  read: (row: Row, ctx: Ctx) => unknown;
  /** choice, ordinal, multi: the values offered, in order (ordinal: lowest first). */
  choices?: readonly string[];
  /** ordinal: rank of each ranked choice; a choice without a rank (such as OTHER) can be matched but not compared. */
  rank?: Readonly<Record<string, number>>;
  /** number: whole numbers from min to max. */
  min?: number;
  max?: number;
  /** records: the shape of one condition's value, how an item matches it, and (for items from `read`) which are listed. */
  valueSchema?: z.ZodType;
  itemMatches?: (item: unknown, value: never, ctx: Ctx) => boolean;
  /** multi: widen a chosen value into every value that counts as it (a unit includes the units below it). */
  expand?: (value: string, ctx: Ctx) => Iterable<string>;
  /** records: which parts a condition value has, so a screen can draw them. */
  valueParts?: ReadonlyArray<{ key: string; kind: 'text' | 'unit' }>;
  /** Organisation units a condition's value names; the viewer's unit scope is checked against them. */
  unitRefs?: (value: never) => string[];
  /** Offered for sorting; the key must be comparable and null when missing (missing sorts last). */
  sortKey?: (row: Row, ctx: Ctx) => string | number | null;
  /** The caller already delivers rows in this field's order (ascending or descending); no sort is applied in memory. */
  baseOrder?: boolean;
}

export type Registry<Row, Ctx, Viewer> = ReadonlyArray<FieldDef<Row, Ctx, Viewer>>;

export interface Condition { field: string; op: string; value?: unknown }
export interface MatchRequest { all?: Condition[]; anyGroups?: Array<{ any: Condition[] }> }
export interface SortRequest { field: string; dir: 'asc' | 'desc' }
export interface PageRequest { limit: number; offset: number }

/** A refusal with a stable code; the message never repeats a value the client sent or names anything hidden. */
export class FilterError extends Error {
  constructor(readonly status: 400 | 403, readonly code: 'BAD_INPUT' | 'FIELD_NOT_ALLOWED' | 'UNIT_NOT_ALLOWED', message: string, readonly fields?: string[]) {
    super(message);
  }
}
