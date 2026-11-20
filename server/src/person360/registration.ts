import { z } from 'zod';
import { cleanData, SECTIONS, SINGLE, type Section } from './rules.js';

export const registrationRecords = z.array(z.object({ section: z.enum(SECTIONS), data: z.record(z.string(), z.unknown()) })).max(50);

/** Flat spreadsheet columns describe one record; JSON section cells allow several. */
export function importProfileRecords(raw: Record<string, unknown>): unknown[] {
  const records: unknown[] = Array.isArray(raw.records) ? [...raw.records] : [];
  for (const section of SECTIONS) {
    if (raw[section]) {
      const values = typeof raw[section] === 'string' ? JSON.parse(raw[section] as string) : raw[section];
      for (const data of Array.isArray(values) ? values : [values]) records.push({ section, data });
    }
    const data: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(raw)) {
      if (!column.startsWith(section + '.') || value === '' || value == null) continue;
      const field = column.slice(section.length + 1);
      data[field] = ['startYear', 'endYear', 'year'].includes(field) ? Number(value) : value;
    }
    if (Object.keys(data).length) records.push({ section, data });
  }
  return records;
}

/** Registration uses names, not cross-person or organisational links. Link saved profiles separately. */
export function cleanRegistrationRecords(records: z.infer<typeof registrationRecords>, writable: Section[]) {
  const singles = new Set<Section>();
  return records.map(record => {
    const data = cleanData(record.section, record.data);
    if (!writable.includes(record.section) || !data || record.data.relatedPersonId || record.data.spousePersonId || record.data.orgUnitId
      || (SINGLE.includes(record.section) && singles.has(record.section))) {
      throw new Error('Invalid or unauthorized profile section; use names for family/spouse and record unit links individually');
    }
    singles.add(record.section);
    return { section: record.section, data };
  });
}
