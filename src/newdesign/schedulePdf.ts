import { buildLetterPdfBlob, downloadBlob } from '../services/letterPdf';

/** A schedule as a simple PDF: a title, then each group (a month, or a service) with its lines. */
export function downloadSchedulePdf(file: string, title: string, subtitle: string, groups: Array<{ heading: string; lines: string[] }>): void {
  const body = groups.map((g) => [g.heading, ...g.lines.map((l) => `   ${l}`), ''].join('\n')).join('\n');
  downloadBlob(`${file}.pdf`, buildLetterPdfBlob({ title, subtitle, bodyText: body }));
}
