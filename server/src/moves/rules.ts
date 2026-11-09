/**
 * Due to move (Systems redesign 1): who in Children, Youth, Men, Women, Couples or Elderly is due to
 * change system. The ages and the trigger are Central Administration settings. Nothing moves by itself:
 * the unit president or secretary confirms every move.
 */
import type { MoveRules } from '../settings/catalog.js';
import { ageOn } from '../groups/rules.js';

export const MOVE_SYSTEMS = ['sys-children', 'sys-youth', 'sys-men', 'sys-women', 'sys-couples', 'sys-elderly'] as const;
export type MoveSystem = (typeof MOVE_SYSTEMS)[number];
export const isMoveSystem = (v: string): v is MoveSystem => (MOVE_SYSTEMS as readonly string[]).includes(v);

export type MoveReason = 'AGE_YOUTH' | 'AGE_ADULT' | 'AGE_ELDERLY' | 'MARRIAGE';

export interface PersonFacts {
  dateOfBirth: string | null;
  gender: string | null;
  married: boolean;
}

export interface Suggestion {
  toSystemId: MoveSystem;
  reason: MoveReason;
  age: number | null;
}

const adultSystem = (gender: string | null): MoveSystem | null => {
  const g = (gender ?? '').toLowerCase();
  if (g.startsWith('m')) return 'sys-men';
  if (g.startsWith('f') || g.startsWith('w')) return 'sys-women';
  return null;
};

/** Where this person is due to go from `from`, or null when they stay. `today` is YYYY-MM-DD. */
export function suggestMove(from: MoveSystem, facts: PersonFacts, rules: MoveRules, today: string): Suggestion | null {
  const age = ageOn(facts.dateOfBirth, today);
  if (from === 'sys-elderly') return null;
  if (age !== null && age >= rules.elderlyFromAge) return { toSystemId: 'sys-elderly', reason: 'AGE_ELDERLY', age };
  if (from === 'sys-children') {
    if (age !== null && age > rules.childMaxAge) return { toSystemId: 'sys-youth', reason: 'AGE_YOUTH', age };
    return null;
  }
  if (from === 'sys-youth') {
    const byAge = age !== null && age > rules.youthMaxAge;
    const byMarriage = facts.married;
    const trigger = rules.adultTrigger;
    const due = (trigger === 'AGE' && byAge) || (trigger === 'MARRIAGE' && byMarriage) || (trigger === 'EITHER' && (byAge || byMarriage));
    if (!due) return null;
    if (byMarriage && trigger !== 'AGE') return { toSystemId: 'sys-couples', reason: 'MARRIAGE', age };
    const to = adultSystem(facts.gender);
    return to ? { toSystemId: to, reason: 'AGE_ADULT', age } : null;
  }
  return null;
}

/** Who may confirm a move out of `fromSystemId`: its president or secretary, or a church-wide leader. */
export function canConfirmMove(holdings: Array<{ office: string; systemId: string | null; scope: string; via: string }>, fromSystemId: string): boolean {
  return holdings.some(
    (h) => h.via === 'OFFICE' && ((h.scope === 'CHURCH' && (h.office === 'CHURCH_LEADER' || h.office === 'CATECHIST')) || (h.systemId === fromSystemId && (h.office === 'PRESIDENT' || h.office === 'SECRETARY'))),
  );
}

/** A person may move only into a system that is a valid next step from where they are. */
export function validTarget(from: MoveSystem, to: string): boolean {
  if (from === 'sys-children') return to === 'sys-youth' || to === 'sys-elderly';
  if (from === 'sys-youth') return ['sys-men', 'sys-women', 'sys-couples', 'sys-elderly'].includes(to);
  if (from === 'sys-elderly') return false;
  return to === 'sys-elderly' || (from !== 'sys-couples' && to === 'sys-couples');
}
