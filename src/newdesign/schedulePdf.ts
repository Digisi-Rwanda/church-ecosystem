import { buildLetterPdfBlob, downloadBlob } from '../services/letterPdf';

/** A schedule as a simple PDF: a title, then each group (a month, or a service) with its lines. */
export function downloadSchedulePdf(file: string, title: string, subtitle: string, groups: Array<{ heading: string; lines: string[] }>): void {
  const body = groups.map((g) => [g.heading, ...g.lines.map((l) => `   ${l}`), ''].join('\n')).join('\n');
  downloadBlob(`${file}.pdf`, buildLetterPdfBlob({ title, subtitle, bodyText: body }));
}

/** Opens print so "Save as PDF" keeps this file name. Landscape matches the protocol week-columns sheet. */
export function printNamedSheet(filename: string, opts?: { landscape?: boolean }): void {
  const before = document.title;
  document.title = filename.replace(/\.pdf$/i, '');
  let style: HTMLStyleElement | undefined;
  if (opts?.landscape) {
    style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; }';
    document.head.appendChild(style);
  }
  window.print();
  window.setTimeout(() => {
    document.title = before;
    style?.remove();
  }, 500);
}
