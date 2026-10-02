/**
 * Import the Protocol team from a CSV.
 *
 *   npx tsx scripts/import-protocol.ts team.csv            # dry run: shows what would happen
 *   npx tsx scripts/import-protocol.ts team.csv --apply    # does it
 *   --accounts        also create a sign-in (username + temporary password) for people who have none;
 *                     the passwords are written to protocol-accounts-<date>.csv, once
 *   --create-choirs   a choir name not found on the server or Music's list is created
 *
 * Columns: Full name, Phone number, Email, Office, Choir  (see src/lib/importProtocol.ts)
 * Safe to run again: people already on the server are updated, not duplicated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyPlan, loadExisting, parseCsv, planRows } from '../src/lib/importProtocol.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  const createChoirs = process.argv.includes('--create-choirs');
  const accounts = process.argv.includes('--accounts');
  if (!file || file.startsWith('--')) {
    console.error('Usage: npx tsx scripts/import-protocol.ts <file.csv> [--apply] [--create-choirs] [--accounts]');
    process.exit(2);
  }
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const plan = planRows(rows, await loadExisting(prisma), { createChoirs });
  if (plan.fatal) {
    console.error(`Cannot import: ${plan.fatal}`);
    process.exit(1);
  }

  const count = (f: (p: (typeof plan.people)[number]) => boolean) => plan.people.filter(f).length;
  console.log(`${rows.length - 1} rows read, ${plan.people.length} people to import`);
  console.log(`  new people:        ${count((p) => !p.personId)}`);
  console.log(`  already on server: ${count((p) => !!p.personId)}`);
  console.log(`  office positions:  ${count((p) => p.createPosition)}`);
  console.log(`  with a choir:      ${count((p) => !!p.choir)}`);
  if (plan.ignoredColumns.length) console.log(`  ignored columns:   ${plan.ignoredColumns.join(', ')}`);
  for (const i of plan.issues) console.log(`  ${i.level === 'error' ? 'ERROR  ' : 'warning'} line ${i.line}: ${i.message}`);
  const errors = plan.issues.filter((i) => i.level === 'error').length;

  if (!apply) {
    console.log('\nDry run: nothing was written. Add --apply to import.');
    return;
  }
  if (errors) console.log(`\n${errors} row(s) with errors are skipped; the rest are imported.`);
  const r = await applyPlan(prisma, plan, { accounts });
  if (r.credentials.length) {
    const file = `protocol-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    writeFileSync(
      file,
      ['Full name,Office,Username,Temporary password', ...r.credentials.map((c) => [c.fullName, c.office, c.username, c.password].map(q).join(','))].join('\n') + '\n',
      { mode: 0o600 },
    );
    console.log(`\n${r.credentials.length} sign-ins created. Temporary passwords are in ${file}: hand them out privately, then delete the file. They are not stored anywhere else.`);
  }
  console.log(
    `\nDone: ${r.peopleCreated} people created, ${r.peopleUpdated} updated, ${r.positionsCreated} office positions, ` +
      `${r.membershipsCreated} memberships, roster +${r.rosterAdded} / ~${r.rosterUpdated}` +
      (r.choirsCreated || r.musicUnitsAdded ? `, ${r.choirsCreated} choirs created, ${r.musicUnitsAdded} added to Music's list.` : '.'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
