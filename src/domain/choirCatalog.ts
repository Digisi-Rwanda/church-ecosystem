/** Umbrella org unit — maps to sys-choir; child choirs scope data under this tree. */
export const CHOIR_PARENT_ORG_UNIT_ID = 'ou-choir';

export interface ChoirOrgUnitEntry {
  id: string;
  name: string;
}

/** Named choirs under ou-choir (no systemId — one shared Choir System). */
export const CHOIR_ORG_UNITS: readonly ChoirOrgUnitEntry[] = [
  { id: 'ou-choir-ijwi', name: "Ijwi ry' umwami Yesu" },
  { id: 'ou-choir-elbethel', name: 'El bethel' },
  { id: 'ou-choir-integuza', name: 'Integuza' },
  { id: 'ou-choir-elim', name: 'Elim' },
  { id: 'ou-choir-beulah', name: 'Beulah' },
  { id: 'ou-choir-yerusalemu', name: 'Yerusalemu' },
  { id: 'ou-choir-hope', name: 'Hope' },
] as const;

const CHOIR_ORG_UNIT_IDS = new Set(CHOIR_ORG_UNITS.map((c) => c.id));

export function isChoirOrgUnitId(id: string): boolean {
  return CHOIR_ORG_UNIT_IDS.has(id);
}

export function choirName(orgUnitId: string): string {
  return CHOIR_ORG_UNITS.find((c) => c.id === orgUnitId)?.name ?? orgUnitId;
}

export function listChoirOrgUnits(): ChoirOrgUnitEntry[] {
  return [...CHOIR_ORG_UNITS];
}
