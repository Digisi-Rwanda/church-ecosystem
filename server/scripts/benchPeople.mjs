// Runs the People search benchmark (5,000 people, 12,000 records) against the in-memory database stand-in.
// Works the same on Windows, macOS and Linux:  npm run bench:people --prefix server
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', 'tests/peopleSearch.bench.test.ts', '--reporter=verbose'], {
  stdio: 'inherit', shell: true, env: { ...process.env, BENCH: '1' },
});
process.exit(r.status ?? 1);
