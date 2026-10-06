/**
 * Mission Health v1 — weighted schedule / delivery / people signals.
 * RAG chip for lists + Pulse.
 */
import {
  requiredDeliveryOpen,
  type MissionStewardship,
} from './stewardship';

export type HealthTone = 'green' | 'amber' | 'red' | 'neutral';

export type HealthResult = {
  score: number;
  tone: HealthTone;
  label: string;
  parts: {
    schedule: number;
    delivery: number;
    people: number;
  };
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function toneOf(score: number): HealthTone {
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  if (score > 0) return 'red';
  return 'neutral';
}

function labelOf(tone: HealthTone): string {
  if (tone === 'green') return 'Healthy';
  if (tone === 'amber') return 'Watch';
  if (tone === 'red') return 'At risk';
  return '—';
}

/**
 * Weights: schedule 40 · delivery 40 · people 20.
 */
export function computeMissionHealth(
  s: MissionStewardship | undefined,
  opts?: {
    status?: string;
    /** 0–100 schedule signal (next session soon, not overdue). */
    scheduleScore?: number;
    /** 0–100 people/roster signal. */
    peopleScore?: number;
  },
): HealthResult {
  const status = opts?.status ?? '';
  const schedule =
    opts?.scheduleScore ??
    (status === 'ACTIVE' || status === 'CONFIRMED'
      ? 80
      : status === 'SETUP' || status === 'PLANNED'
        ? 55
        : status === 'CLOSING'
          ? 40
          : status === 'ENDED' || status === 'DONE'
            ? 100
            : 50);

  let delivery = 80;
  if (s?.deliveryItems?.length) {
    const required = s.deliveryItems.filter((d) => d.tier === 'REQUIRED');
    const open = requiredDeliveryOpen(s);
    if (required.length === 0) delivery = 85;
    else {
      const done = required.length - open.length;
      delivery = clamp(Math.round((done / required.length) * 100));
    }
  } else if (status === 'CLOSING') {
    delivery = 40;
  }

  const people = opts?.peopleScore ?? (status === 'ACTIVE' ? 75 : 60);

  const score = clamp(
    Math.round(
      schedule * 0.4 + delivery * 0.4 + people * 0.2,
    ),
  );
  const tone = toneOf(score);
  return {
    score,
    tone,
    label: labelOf(tone),
    parts: { schedule, delivery, people },
  };
}
