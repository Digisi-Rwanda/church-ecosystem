/** Reading Music's decided months from the database; Protocol plans against what is read here. */
import { prisma } from '../lib/prisma.js';
import { parse, unitsFrom, type MonthDoc } from './schedule.js';
import type { MusicAssignment, MusicScheduleUnit, MusicServiceSlot } from './types.js';

interface MonthRow {
  periodKey: string; state: string; version: number; batchId?: string | null; batchHorizon?: string | null;
  servicesJson: string; assignmentsJson: string; warningsJson?: string | null;
  confirmedAt?: Date | string | null; publishedAt?: Date | string | null; updatedAt?: Date | string | null;
}
interface ChoirRow { id: string; name: string; role: string; active: boolean; systemId?: string | null }

export const toDoc = (r: MonthRow): MonthDoc => ({
  periodKey: r.periodKey, state: r.state === 'PUBLISHED' ? 'PUBLISHED' : 'CONFIRMED', version: r.version, batchId: r.batchId, batchHorizon: r.batchHorizon,
  services: parse<MusicServiceSlot[]>(r.servicesJson, []), assignments: parse<MusicAssignment[]>(r.assignmentsJson, []), warnings: parse<string[]>(r.warningsJson, []),
});

export const loadMonthRows = async (): Promise<MonthRow[]> => (await prisma.musicMonth.findMany()) as MonthRow[];
export const loadMonths = async (): Promise<MonthDoc[]> => (await loadMonthRows()).map(toDoc);
export const loadChoirs = async (): Promise<ChoirRow[]> => (await prisma.musicChoir.findMany()) as ChoirRow[];
export const loadUnits = async (): Promise<MusicScheduleUnit[]> => unitsFrom(await loadChoirs());

/** The month as Protocol and the choirs see it: published if it is, else confirmed ahead of release. */
export async function getPlanned(month: string): Promise<MonthDoc | null> {
  const row = (await loadMonthRows()).find((r) => r.periodKey === month);
  return row ? toDoc(row) : null;
}
