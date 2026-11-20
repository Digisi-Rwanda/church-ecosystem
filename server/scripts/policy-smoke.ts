/**
 * Smoke checks for the server policy engine (DB-backed).
 * Run: npm run test:policy  (from server/)
 */
import 'dotenv/config';
import { authorizePerson, grantsForPerson } from '../src/policy/index.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const pastorYouth = await authorizePerson({
    personId: 'p-pastor',
    systemId: 'sys-youth',
    resource: 'SYSTEM',
    action: 'ENTER',
  });
  assert(pastorYouth.allowed, 'Pastor should ENTER sys-youth via governance');

  const treasProtocol = await authorizePerson({
    personId: 'p-church-treas',
    systemId: 'sys-protocol',
    resource: 'SYSTEM',
    action: 'ENTER',
  });
  assert(
    treasProtocol.allowed,
    'Treasurer should ENTER sys-protocol via seeded Assignment',
  );

  const treasGrants = await grantsForPerson('p-church-treas');
  assert(
    treasGrants.some(
      (g) =>
        g.systemId === 'sys-protocol' &&
        g.resource === 'SYSTEM' &&
        g.action === 'ENTER' &&
        g.source === 'ASSIGNMENT',
    ),
    'Treasurer grants should include ASSIGNMENT ENTER protocol',
  );

  console.log('policy smoke OK');
  console.log(`  pastor ENTER youth: ${pastorYouth.allowed}`);
  console.log(`  treasurer ENTER protocol (assignment): ${treasProtocol.allowed}`);
  console.log(`  treasurer grant count: ${treasGrants.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
