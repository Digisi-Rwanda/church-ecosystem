/**
 * Protocol offices from the server's Positions.
 *
 * Who is Coordinator / President / Vice President must be the same in every
 * browser and match what the server checks. The server is the source; this
 * copies it into the app's positions and people lists (replacing what an
 * earlier fetch put there; the demo seed is left alone).
 */
import type { Person, Position, ProtocolOffice } from '../domain/types';
import { PEOPLE, POSITIONS } from './seed';

export type ServerProtocolOffice = {
  id: string;
  personId: string;
  title: string;
  protocolOffice: string;
  startDate: string;
  person: {
    id: string;
    fullName: string;
    preferredName?: string | null;
    email?: string | null;
  } | null;
};

const PREFIX = 'srv-proto-';
const OFFICES: ProtocolOffice[] = ['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER', 'COORDINATOR', 'MEMBER'];

/** Returns true when something changed. */
export function applyProtocolOffices(list: ServerProtocolOffice[]): boolean {
  let changed = false;
  const wanted = new Map<string, Position>();
  for (const o of list) {
    if (!OFFICES.includes(o.protocolOffice as ProtocolOffice)) continue;
    if (o.person && !PEOPLE.some((p) => p.id === o.person!.id)) {
      PEOPLE.push({
        id: o.person.id,
        fullName: o.person.fullName,
        preferredName: o.person.preferredName ?? undefined,
        email: o.person.email ?? undefined,
        status: 'ACTIVE',
        createdAt: o.startDate,
      } as Person);
      changed = true;
    }
    wanted.set(PREFIX + o.id, {
      id: PREFIX + o.id,
      personId: o.personId,
      title: o.title,
      orgUnitId: 'ou-protocol',
      protocolOffice: o.protocolOffice as ProtocolOffice,
      systemId: 'sys-protocol',
      status: 'ACTIVE',
      startDate: o.startDate,
    } as Position);
  }
  for (let i = POSITIONS.length - 1; i >= 0; i--) {
    const p = POSITIONS[i]!;
    if (!p.id.startsWith(PREFIX)) continue;
    const next = wanted.get(p.id);
    if (!next) {
      POSITIONS.splice(i, 1);
      changed = true;
    } else {
      if (JSON.stringify(next) !== JSON.stringify(p)) {
        POSITIONS[i] = next;
        changed = true;
      }
      wanted.delete(p.id);
    }
  }
  for (const p of wanted.values()) {
    POSITIONS.push(p);
    changed = true;
  }
  return changed;
}
