/**
 * Writes prisma/demoAccounts.json from the SPA's demo seed, so every demo
 * login (music, protocol, protocolpres, …) also exists on the server and can
 * sign in through the API — which is what lets them share Music/Protocol data.
 *
 *   npx tsx scripts/export-demo-accounts.ts
 */
import { writeFileSync } from 'node:fs';
import { ACCOUNTS, PEOPLE } from '../../src/data/seed';

const byId = new Map(PEOPLE.map((p) => [p.id, p]));
const out = ACCOUNTS.map((a) => {
  const p = byId.get(a.personId);
  return {
    accountId: a.id,
    username: a.username,
    password: a.password,
    person: {
      id: a.personId,
      fullName: p?.fullName ?? a.username,
      preferredName: p?.preferredName ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
    },
  };
});
writeFileSync(
  new URL('../prisma/demoAccounts.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`Wrote ${out.length} demo accounts`);
