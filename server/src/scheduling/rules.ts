/**
 * Configurable scheduling authorization rules (slice 3.17).
 *
 * Reuses the lettersInSystem capability engine and the same SCHEDULING/PEOPLE
 * module letters that Music and Protocol already gate on. Tenant-scoped: a
 * caller's letters must be held in the target systemId, never inferred from a
 * client-supplied systemId alone.
 */

import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

/** System ids that own configuration. */
export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

const held = (me: string, systemId: string, mod: 'PEOPLE' | 'SCHEDULING', d: AccessData, now: Date): string[] =>
  lettersInSystem(me, systemId, d, now)[mod] as string[];

/** Read any scheduling configuration in a system: Music or Protocol SCHEDULING R. */
export const canReadConfig = (me: string, systemId: string, d: AccessData, now = new Date()): boolean =>
  held(me, systemId, 'SCHEDULING', d, now).includes('R');

/** Write scheduling configuration in a system: Music or Protocol SCHEDULING W. */
export const canWriteConfig = (me: string, systemId: string, d: AccessData, now = new Date()): boolean =>
  held(me, systemId, 'SCHEDULING', d, now).includes('W');

/** Oversight of scheduling in a system: PEOPLE R (church-wide view). */
export const canOverseeConfig = (me: string, systemId: string, d: AccessData, now = new Date()): boolean =>
  held(me, systemId, 'PEOPLE', d, now).includes('R');

/** Guard helper used by routes. Returns { me, systemId } or answers 403/404. */
export type ConfigGate = { me: string; systemId: string; canWrite: boolean };

export async function gateConfig(
  me: string, systemId: string, d: AccessData, res: import('express').Response, write: boolean,
): Promise<ConfigGate | null> {
  if (!canReadConfig(me, systemId, d)) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return null;
  }
  if (write && !canWriteConfig(me, systemId, d)) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }
  return { me, systemId, canWrite: canWriteConfig(me, systemId, d) };
}
