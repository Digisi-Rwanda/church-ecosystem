import 'dotenv/config';
import { firstChiefAdministrator } from '../src/lib/firstChiefAdministrator.js';

const args = process.argv.slice(2);
const read = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const username = read('--username');
if (!username || username.startsWith('--')) {
  console.log('Dry run: npx tsx scripts/first-chief-administrator.ts --username EXISTING_USERNAME');
  console.log('Apply after verifying identity: add --apply --person-id EXACT_PERSON_ID');
} else {
  const { prisma } = await import('../src/lib/prisma.js');
  try {
    console.log(JSON.stringify(await firstChiefAdministrator(prisma, {username,apply:args.includes('--apply'),expectedPersonId:read('--person-id')}),null,2));
  } catch (reason) {
    console.error(reason instanceof Error ? reason.message : 'Chief Administrator setup failed');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
