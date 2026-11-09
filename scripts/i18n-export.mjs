#!/usr/bin/env node
/**
 * Writes a spreadsheet for a reviewer:  node scripts/i18n-export.mjs rw   (or fr)
 * Columns: key, english, translation (filled with what is already written), context (the part of the app).
 * Open the CSV in Excel or Google Sheets, write or correct the third column, save as CSV, then run i18n-import.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMessages, root } from './i18n-lib.mjs';

const lang = process.argv[2];
if (!['rw', 'fr'].includes(lang)) { console.error('Usage: node scripts/i18n-export.mjs rw|fr'); process.exit(1); }
const en = await loadMessages('en');
const cat = await loadMessages(lang);
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [['key', 'english', 'translation', 'part of the app'].map(q).join(',')];
for (const [k, v] of Object.entries(en)) rows.push([k, v, cat[k] ?? '', k.split('.').slice(0, 3).join(' > ')].map(q).join(','));
const out = join(root, `translations-${lang}.csv`);
writeFileSync(out, '﻿' + rows.join('\r\n') + '\r\n', 'utf8');
console.log(`Wrote ${out} (${rows.length - 1} texts). Keep {placeholders} exactly as in English.`);
