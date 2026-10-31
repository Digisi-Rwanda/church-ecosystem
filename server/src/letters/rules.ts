/**
 * Letters desk (slice 2.3): who may do what with a letter. Pure.
 *
 * A letter belongs to a unit and so to a system. Reading needs R in Governance there,
 * drafting needs W, and printing a letter for the handwritten signature and recording its
 * delivery needs S. The handwritten signature itself is never recorded in the app.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { dayStart } from '../governance/rules.js';

export const LETTER_STATUSES = ['DRAFT', 'DELIVERED', 'WITHDRAWN'] as const;
export const DELIVERY_METHODS = ['HAND', 'POST', 'EMAIL', 'OTHER'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const SUBJECT_MAX = 160;
export const BODY_MAX = 8000;

const has = (personId: string, systemId: string, data: AccessData, letter: 'R' | 'W' | 'S', now: Date) =>
  lettersInSystem(personId, systemId, data, now).GOVERNANCE.includes(letter);

export const canRead = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, 'R', now);
export const canWrite = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, 'W', now);
export const canSend = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, 'S', now);

/** The reference a letter carries, such as KAC-2026-0007. */
export const letterReference = (prefix: string, year: number, seq: number): string =>
  `${prefix}-${year}-${String(seq).padStart(4, '0')}`;

/** What the delivery record must say: how and on which day, and not in the future. */
export function deliveryProblem(
  input: { method?: string; deliveredOn?: string },
  now = new Date(),
): 'METHOD' | 'DATE' | null {
  if (!input.method || !(DELIVERY_METHODS as readonly string[]).includes(input.method)) return 'METHOD';
  const day = input.deliveredOn ? dayStart(input.deliveredOn) : null;
  if (!day || day.getTime() > now.getTime() + 24 * 3600 * 1000) return 'DATE';
  return null;
}
