/**
 * Catalog of schedulable Music units (choirs + worship).
 *
 * The lineup is configuration, not code: the engine, validation, UI and the
 * Protocol module all read the live registry below. Choirs are added with
 * `addMusicUnit` and retired with `setMusicUnitActive(id, false)` — never
 * deleted — so published history keeps resolving names and kinds.
 */
import type { MusicScheduleUnit, MusicUnitKind } from './musicSchedule';

export const DEFAULT_MUSIC_UNITS: readonly MusicScheduleUnit[] = [
  {
    id: 'mu-ijwi',
    kind: 'PRIMARY',
    name: "Ijwi ry' umwami Yesu",
    orgUnitId: 'ou-choir-ijwi',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-elbethel',
    kind: 'PRIMARY',
    name: 'El bethel',
    orgUnitId: 'ou-choir-elbethel',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-elim',
    kind: 'PRIMARY',
    name: 'Elim',
    orgUnitId: 'ou-choir-elim',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-integuza',
    kind: 'PRIMARY',
    name: 'Integuza',
    orgUnitId: 'ou-choir-integuza',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-beulah',
    kind: 'SECONDARY',
    name: 'Beulah',
    orgUnitId: 'ou-choir-beulah',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-yerusalemu',
    kind: 'SECONDARY',
    name: 'Yerusalemu',
    orgUnitId: 'ou-choir-yerusalemu',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-hope',
    kind: 'CHILDREN',
    name: 'Hope',
    orgUnitId: 'ou-choir-hope',
    systemId: 'sys-choir',
    active: true,
  },
  {
    id: 'mu-worship',
    kind: 'WORSHIP',
    name: 'Worship team',
    orgUnitId: 'ou-worship',
    systemId: 'sys-worship',
    active: true,
  },
];

/**
 * The built-in lineup is demo data. With VITE_DEMO_SEED=false the lineup starts
 * empty and comes from the church's own data (the shared Music document).
 */
const SHOW_DEMO_UNITS =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_SEED !== 'false';

function cloneDefaults(): MusicScheduleUnit[] {
  return SHOW_DEMO_UNITS ? DEFAULT_MUSIC_UNITS.map((u) => ({ ...u })) : [];
}

let UNITS: MusicScheduleUnit[] = cloneDefaults();

/** Every unit ever configured, active or not (history needs the inactive ones). */
export function getMusicUnits(): readonly MusicScheduleUnit[] {
  return UNITS;
}

export function isUnitActive(u: MusicScheduleUnit): boolean {
  return u.active !== false;
}

/** Units the engine may schedule right now. */
export function activeMusicUnits(
  kind?: MusicUnitKind,
  units: readonly MusicScheduleUnit[] = UNITS,
): MusicScheduleUnit[] {
  return units.filter((u) => isUnitActive(u) && (!kind || u.kind === kind));
}

export function primaryUnitIds(
  units: readonly MusicScheduleUnit[] = UNITS,
): string[] {
  return activeMusicUnits('PRIMARY', units).map((u) => u.id);
}

export function musicUnitById(id: string): MusicScheduleUnit | undefined {
  return UNITS.find((u) => u.id === id);
}

export function musicUnitName(id: string): string {
  return musicUnitById(id)?.name ?? id;
}

export function musicUnitKind(id: string): MusicUnitKind | undefined {
  return musicUnitById(id)?.kind;
}

export function replaceMusicUnits(next: MusicScheduleUnit[] | null | undefined) {
  UNITS =
    Array.isArray(next) && next.length > 0
      ? next.map((u) => ({ ...u }))
      : cloneDefaults();
}

export function resetMusicUnits() {
  UNITS = cloneDefaults();
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function addMusicUnit(input: {
  name: string;
  kind: MusicUnitKind;
  orgUnitId?: string;
}): { ok: boolean; reason?: string; unit?: MusicScheduleUnit } {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'Choir name is required' };
  if (UNITS.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: 'A choir with that name already exists' };
  }
  let id = `mu-${slug(name) || 'unit'}`;
  let n = 2;
  while (UNITS.some((u) => u.id === id)) id = `mu-${slug(name)}-${n++}`;
  const unit: MusicScheduleUnit = {
    id,
    kind: input.kind,
    name,
    orgUnitId: input.orgUnitId?.trim() || undefined,
    systemId: input.kind === 'WORSHIP' ? 'sys-worship' : 'sys-choir',
    active: true,
  };
  UNITS = [...UNITS, unit];
  return { ok: true, unit };
}

export function setMusicUnitActive(
  id: string,
  active: boolean,
): { ok: boolean; reason?: string } {
  const u = musicUnitById(id);
  if (!u) return { ok: false, reason: 'Unknown choir' };
  if (!active && u.kind === 'PRIMARY' && primaryUnitIds().length <= 2) {
    return {
      ok: false,
      reason: 'At least 2 primary choirs must stay active (Igaburo needs 2)',
    };
  }
  UNITS = UNITS.map((x) => (x.id === id ? { ...x, active } : x));
  return { ok: true };
}

export function renameMusicUnit(
  id: string,
  name: string,
): { ok: boolean; reason?: string } {
  const n = name.trim();
  if (!n) return { ok: false, reason: 'Name is required' };
  if (!musicUnitById(id)) return { ok: false, reason: 'Unknown choir' };
  UNITS = UNITS.map((x) => (x.id === id ? { ...x, name: n } : x));
  return { ok: true };
}
