/**
 * One-off clean-up: the church no longer keeps Gifts, Skills or Good deeds on a person.
 * This removes the old rows for good. It is NOT run by deploys or migrations.
 *
 *   npx tsx scripts/remove-gifts-skills-deeds.ts          # dry run: only counts, deletes nothing
 *   npx tsx scripts/remove-gifts-skills-deeds.ts --yes    # really deletes (cannot be undone: take a Neon backup/branch first)
 *
 * Needs DATABASE_URL in the environment, like the server.
 */
import { prisma } from '../src/lib/prisma.js';

const really = process.argv.includes('--yes');
const where = { section: { in: ['GIFT', 'SKILL'] } };

async function main() {
  const records = await prisma.personRecord.count({ where });
  const deeds = await prisma.personDeed.count();
  console.log(`Gift and skill records: ${records}`);
  console.log(`Good deeds:             ${deeds}`);
  if (!really) {
    console.log('\nDry run: nothing was deleted. Run again with --yes to delete these rows.');
    return;
  }
  const a = await prisma.personRecord.deleteMany({ where });
  const b = await prisma.personDeed.deleteMany({});
  console.log(`\nDeleted ${a.count} gift/skill records and ${b.count} good deeds.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
