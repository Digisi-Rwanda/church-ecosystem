import 'dotenv/config';
import { firstChiefAdministrator } from '../src/lib/firstChiefAdministrator.js';

// Dedicated opt-in seed: no demo identities, password creation, or general seed work.
const enabled = process.env.SEED_FIRST_CHIEF_ADMINISTRATOR;
if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') {
  throw new Error('SEED_FIRST_CHIEF_ADMINISTRATOR must be true or false.');
}
if (enabled !== 'true') {
  console.log('Chief Administrator seed skipped (explicit opt-in required).');
} else {
  const username = process.env.FIRST_CHIEF_ADMINISTRATOR_USERNAME?.trim();
  const expectedPersonId = process.env.FIRST_CHIEF_ADMINISTRATOR_PERSON_ID?.trim();
  if (!username || !expectedPersonId) {
    throw new Error('Set FIRST_CHIEF_ADMINISTRATOR_USERNAME and FIRST_CHIEF_ADMINISTRATOR_PERSON_ID after verifying the existing account/person match.');
  }
  const { prisma } = await import('../src/lib/prisma.js');
  try {
    console.log(JSON.stringify(await firstChiefAdministrator(prisma, {
      username, expectedPersonId, apply: true, allowExisting: true,
    }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Chief Administrator seed failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
