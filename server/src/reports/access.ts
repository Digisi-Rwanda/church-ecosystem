import { lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { CHURCH_WIDE, SOURCE, type ReportKind } from './builders.js';
import { accessFor } from '../person360/rules.js';

const held = (me: string, systemId: string, data: AccessData, now: Date) => lettersInSystem(me, systemId, data, now).REPORTS as string[];
export const canReadReports = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('R');
export const canCompose = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('W');
export const canPublish = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('P');
/** To compose a report from records, the composer must be allowed to read those records. */
export function canReadSource(me: string, s: string, kind: ReportKind, d: AccessData, now = new Date()): boolean {
  if (CHURCH_WIDE.includes(kind)) {
    if (s !== 'sys-main') return false;
    return accessFor(me, d, now).read.includes(kind === 'MARRIAGES' ? 'MARRIAGE' : 'BAPTISM');
  }
  return (lettersInSystem(me, s, d, now)[SOURCE[kind]] as string[]).includes('R');
}
