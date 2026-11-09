export type StewardshipBlob = {
  deliveryItems?: Array<{
    tier?: string;
    status?: string;
    [k: string]: unknown;
  }>;
  closeout?: Record<string, unknown>;
  healthSnapshots?: Array<{
    date?: string;
    score?: number;
    tone?: string;
    label?: string;
    parts?: Record<string, number>;
    [k: string]: unknown;
  }>;
  blockers?: Array<{
    id?: string;
    title?: string;
    severity?: string;
    status?: string;
    ownerPersonId?: string;
    createdAt?: string;
    resolvedAt?: string;
    deliveryItemId?: string;
    taskId?: string;
    note?: string;
    [k: string]: unknown;
  }>;
};

export function parseStewardship(raw: string | null | undefined): StewardshipBlob {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as StewardshipBlob) : {};
  } catch {
    return {};
  }
}

export function serializeStewardship(s: StewardshipBlob): string {
  return JSON.stringify(s);
}

export function requiredDeliveryOpen(s: StewardshipBlob) {
  return (s.deliveryItems ?? []).filter(
    (d) => d.tier === 'REQUIRED' && d.status === 'TODO',
  );
}

export function deliveryReadyToClose(s: StewardshipBlob): boolean {
  return requiredDeliveryOpen(s).length === 0;
}

export function mergeStewardship(
  current: StewardshipBlob,
  patch: Partial<StewardshipBlob>,
): StewardshipBlob {
  return { ...current, ...patch };
}

export function upsertHealthSnapshot(
  s: StewardshipBlob,
  snap: {
    date: string;
    score: number;
    tone: string;
    label: string;
    parts?: Record<string, number>;
  },
  keep = 30,
): StewardshipBlob {
  const rest = (s.healthSnapshots ?? []).filter((h) => h.date !== snap.date);
  const healthSnapshots = [...rest, snap]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-keep);
  return { ...s, healthSnapshots };
}
