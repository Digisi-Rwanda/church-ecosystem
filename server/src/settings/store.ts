import { prisma } from '../lib/prisma.js';
import { resolve, type SettingValues } from './catalog.js';

type Row = { key: string; valueJson: string; updatedAt?: Date | string | null; updatedById?: string | null };

export async function loadSettingRows(): Promise<Row[]> {
  return (await prisma.setting.findMany()) as Row[];
}

/** Every setting, stored values over defaults. */
export async function loadSettings(): Promise<SettingValues> {
  return resolve(await loadSettingRows());
}
