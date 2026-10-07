import { lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { SOURCE, type ReportKind } from './builders.js';

const held = (me: string, systemId: string, data: AccessData, now: Date) => lettersInSystem(me, systemId, data, now).REPORTS as string[];
export const canReadReports = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('R');
export const canCompose = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('W');
export const canPublish = (me: string, s: string, d: AccessData, now = new Date()) => held(me, s, d, now).includes('P');
/** To compose a report from records, the composer must be allowed to read those records. */
export const canReadSource = (me: string, s: string, kind: ReportKind, d: AccessData, now = new Date()) =>
  (lettersInSystem(me, s, d, now)[SOURCE[kind]] as string[]).includes('R');
