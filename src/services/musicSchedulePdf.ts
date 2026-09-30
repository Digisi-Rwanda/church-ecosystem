import { MUSIC_SERVICE_LABELS } from '../domain/musicSchedule';
import type { MusicAssignment, MusicServiceSlot } from '../domain/musicSchedule';
import { musicUnitName } from '../domain/musicUnits';
import { buildLetterPdfBlob, downloadBlob } from './letterPdf';

function linesForSchedule(
  periodKey: string,
  horizon: string,
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
): string {
  const byService = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byService.get(a.serviceId) ?? [];
    list.push(a.unitId);
    byService.set(a.serviceId, list);
  }
  const rows = [...services].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );
  const lines: string[] = [
    `Period: ${periodKey}`,
    `Horizon: ${horizon}`,
    '',
    'Date       Service              Choirs scheduled',
    '---------- -------------------- -----------------------------',
  ];
  for (const s of rows) {
    const units = [...new Set(byService.get(s.id) ?? [])].map(musicUnitName);
    const choirs = units.length ? units.join(', ') : '—';
    lines.push(
      `${s.date.padEnd(10)} ${MUSIC_SERVICE_LABELS[s.kind].padEnd(20)} ${choirs}`,
    );
  }
  return lines.join('\n');
}

export function downloadMusicSchedulePdf(input: {
  periodKey: string;
  horizon: string;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  label?: string;
}) {
  if (!input.services.length) {
    return { ok: false as const, reason: 'No calendar to export' };
  }
  const body = linesForSchedule(
    input.periodKey,
    input.horizon,
    input.services,
    input.assignments,
  );
  const filename = `choir-schedule-${input.periodKey}.pdf`;
  const blob = buildLetterPdfBlob({
    title: 'Music choir schedule',
    subtitle: input.label ?? `${input.periodKey} · ${input.horizon}`,
    bodyText: body,
    footerLines: ['ADEPR Kacyiru · Music Ministry'],
  });
  downloadBlob(filename, blob);
  return { ok: true as const, filename };
}
