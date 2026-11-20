import {
  parseStewardship,
  requiredDeliveryOpen,
  type StewardshipBlob,
} from './stewardshipJson.js';

export type HealthTone = 'green' | 'amber' | 'red' | 'neutral';

export type PulseDto = {
  kind: 'PROGRAM' | 'PROJECT';
  id: string;
  name: string;
  status: string;
  health: {
    score: number;
    tone: HealthTone;
    label: string;
    parts: {
      schedule: number;
      delivery: number;
      people: number;
    };
  };
  openRequiredDelivery: Array<{ id?: string; title?: string; status?: string }>;
  nextSession?: {
    id: string;
    title: string;
    startsAt: string;
    sessionClosedAt?: string;
  } | null;
  needsMeHints: string[];
  healthSnapshots?: Array<{
    date: string;
    score: number;
    tone: string;
    label: string;
  }>;
  blockers?: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    ownerPersonId: string;
    createdAt: string;
    ageDays: number;
    deliveryItemId?: string;
    taskId?: string;
  }>;
  impact?: {
    participantsServed: number;
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

export function computeHealthBlob(
  s: StewardshipBlob,
  opts: {
    status: string;
    scheduleScore?: number;
    peopleScore?: number;
  },
) {
  const status = opts.status;
  const schedule =
    opts.scheduleScore ??
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
  const items = s.deliveryItems ?? [];
  const required = items.filter((d) => d.tier === 'REQUIRED');
  const open = requiredDeliveryOpen(s);
  if (required.length === 0) {
    delivery = status === 'CLOSING' ? 40 : 85;
  } else {
    delivery = clamp(
      Math.round(((required.length - open.length) / required.length) * 100),
    );
  }

  const people = opts.peopleScore ?? (status === 'ACTIVE' ? 75 : 60);
  const score = clamp(
    Math.round(schedule * 0.4 + delivery * 0.4 + people * 0.2),
  );
  const tone = toneOf(score);
  return {
    score,
    tone,
    label: labelOf(tone),
    parts: { schedule, delivery, people },
  };
}

export function buildPulseFromStewardship(input: {
  kind: 'PROGRAM' | 'PROJECT';
  id: string;
  name: string;
  status: string;
  stewardshipJson?: string | null;
  nextSession?: PulseDto['nextSession'];
  enrollmentCount?: number;
  scheduleScore?: number;
}): PulseDto {
  const s = parseStewardship(input.stewardshipJson);
  const peopleScore =
    input.enrollmentCount == null
      ? undefined
      : input.enrollmentCount === 0
        ? 35
        : clamp(40 + Math.min(60, input.enrollmentCount * 5));

  const health = computeHealthBlob(s, {
    status: input.status,
    scheduleScore: input.scheduleScore,
    peopleScore,
  });

  const openReq = requiredDeliveryOpen(s);
  const needsMeHints: string[] = [];
  if (input.status === 'PENDING_APPROVAL') {
    needsMeHints.push('Awaiting approval');
  }
  if (input.status === 'SETUP' || input.status === 'PLANNED') {
    needsMeHints.push('In setup — start when ready');
  }
  if (input.status === 'CLOSING') {
    needsMeHints.push('Finish close-out');
  }
  if (openReq.length) {
    needsMeHints.push(`${openReq.length} required delivery open`);
  }
  const openBlocks = (s.blockers ?? []).filter(
    (b) => b.status !== 'RESOLVED' && typeof b.id === 'string',
  );
  if (openBlocks.length) {
    needsMeHints.push(`${openBlocks.length} open blocker(s)/risk(s)`);
  }
  if (input.nextSession && !input.nextSession.sessionClosedAt) {
    needsMeHints.push(`Next session: ${input.nextSession.title}`);
  }

  const now = Date.now();
  return {
    kind: input.kind,
    id: input.id,
    name: input.name,
    status: input.status,
    health,
    openRequiredDelivery: openReq.map((d) => ({
      id: typeof d.id === 'string' ? d.id : undefined,
      title: typeof d.title === 'string' ? d.title : undefined,
      status: typeof d.status === 'string' ? d.status : undefined,
    })),
    nextSession: input.nextSession ?? null,
    needsMeHints,
    healthSnapshots: (s.healthSnapshots ?? [])
      .filter((h): h is { date: string; score: number; tone: string; label: string } =>
        typeof h.date === 'string' &&
        typeof h.score === 'number' &&
        typeof h.tone === 'string' &&
        typeof h.label === 'string',
      )
      .slice(-14),
    blockers: openBlocks.map((b) => {
      const created =
        typeof b.createdAt === 'string' ? b.createdAt : new Date().toISOString();
      const ageDays = Math.max(
        0,
        Math.floor((now - new Date(created).getTime()) / 86400000),
      );
      return {
        id: String(b.id),
        title: typeof b.title === 'string' ? b.title : 'Blocker',
        severity: typeof b.severity === 'string' ? b.severity : 'RISK',
        status: typeof b.status === 'string' ? b.status : 'OPEN',
        ownerPersonId:
          typeof b.ownerPersonId === 'string' ? b.ownerPersonId : '',
        createdAt: created,
        ageDays,
        deliveryItemId:
          typeof b.deliveryItemId === 'string' ? b.deliveryItemId : undefined,
        taskId: typeof b.taskId === 'string' ? b.taskId : undefined,
      };
    }),
    impact: {
      participantsServed: Math.max(0, Number(input.enrollmentCount) || 0),
    },
  };
}
