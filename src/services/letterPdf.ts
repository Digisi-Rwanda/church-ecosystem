/**
 * Minimal PDF writer for church letters (no external dependency).
 * Produces a printable single- or multi-page PDF from plain text.
 */

function pdfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > maxChars) {
    let breakAt = rest.lastIndexOf(' ', maxChars);
    if (breakAt < maxChars * 0.4) breakAt = maxChars;
    out.push(rest.slice(0, breakAt).trimEnd());
    rest = rest.slice(breakAt).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function wrapBody(body: string, maxChars = 86): string[] {
  const lines: string[] = [];
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    if (!raw.trim()) {
      lines.push('');
      continue;
    }
    lines.push(...wrapLine(raw, maxChars));
  }
  return lines;
}

export type LetterPdfInput = {
  title: string;
  subtitle?: string;
  referenceNumber?: string;
  bodyText: string;
  footerLines?: string[];
};

/**
 * Build a PDF Blob for a letter. Uses Helvetica; UTF-8 letters outside
 * WinAnsi may render as '?' — acceptable for demo / Rwanda office English-Kinyarwanda mix until a full font pack lands.
 */
export function buildLetterPdfBlob(input: LetterPdfInput): Blob {
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const marginX = 50;
  const marginTop = 72;
  const marginBottom = 56;
  const lineHeight = 14;
  const fontSize = 11;
  const titleSize = 14;

  const header: string[] = [];
  header.push('ADEPR Kacyiru');
  if (input.referenceNumber) header.push(`Ref: ${input.referenceNumber}`);
  header.push(input.title);
  if (input.subtitle) header.push(input.subtitle);
  header.push('');

  const bodyLines = wrapBody(input.bodyText);
  const footer = input.footerLines ?? [];
  const allContent = [...header, ...bodyLines, '', ...footer];

  const usableHeight = pageHeight - marginTop - marginBottom;
  const linesPerPage = Math.max(1, Math.floor(usableHeight / lineHeight) - 4);

  const pages: string[][] = [];
  for (let i = 0; i < allContent.length; i += linesPerPage) {
    pages.push(allContent.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['(empty letter)']);

  const objects: string[] = [];
  const offsets: number[] = [0];

  function addObject(content: string) {
    offsets.push(offsets[offsets.length - 1]! + content.length);
    objects.push(content);
  }

  // 1: Catalog
  addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages (kids filled later — we'll rebuild)
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  // Reserve IDs: 1 catalog, 2 pages, then pairs of page+content, then font
  // We'll construct in order: catalog(1), pages(2), for each page: pageObj, contentObj, then font

  // Rebuild properly in one pass
  const parts: { id: number; body: string }[] = [];
  let nextId = 1;

  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;

  for (let p = 0; p < pages.length; p++) {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  }

  parts.push({
    id: catalogId,
    body: `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`,
  });

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  parts.push({
    id: pagesId,
    body: `${pagesId} 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pages.length} >>\nendobj\n`,
  });

  parts.push({
    id: fontId,
    body: `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  });

  for (let p = 0; p < pages.length; p++) {
    const pageId = pageObjectIds[p]!;
    const contentId = contentObjectIds[p]!;
    const pageLines = pages[p]!;

    let y = pageHeight - marginTop;
    const streamLines: string[] = ['BT', `/F1 ${fontSize} Tf`, `${marginX} ${y} Td`];
    let first = true;
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i]!;
      const size = p === 0 && i < 3 ? titleSize : fontSize;
      if (!first) {
        streamLines.push(`0 -${lineHeight} Td`);
      }
      first = false;
      if (p === 0 && i < 3) {
        streamLines.push(`/F1 ${size} Tf`);
      } else if (p === 0 && i === 3) {
        streamLines.push(`/F1 ${fontSize} Tf`);
      }
      streamLines.push(`(${pdfEscape(line)}) Tj`);
      y -= lineHeight;
    }
    streamLines.push('ET');
    // page number
    streamLines.push(
      'BT',
      `/F1 9 Tf`,
      `${pageWidth / 2 - 20} ${marginBottom - 24} Td`,
      `(${p + 1} / ${pages.length}) Tj`,
      'ET',
    );

    const stream = streamLines.join('\n');
    parts.push({
      id: contentId,
      body: `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    });
    parts.push({
      id: pageId,
      body: `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`,
    });
  }

  parts.sort((a, b) => a.id - b.id);

  let pdf = '%PDF-1.4\n';
  const xrefOffsets: number[] = [0];
  for (const part of parts) {
    xrefOffsets[part.id] = pdf.length;
    pdf += part.body;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${parts.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= parts.length; i++) {
    const off = xrefOffsets[i] ?? 0;
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${parts.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadLetterPdf(filename: string, input: LetterPdfInput) {
  downloadBlob(filename, buildLetterPdfBlob(input));
}
