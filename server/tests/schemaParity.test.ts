import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The two Prisma schemas (local and Postgres, the one Render uses) must describe the same tables and columns. */
function models(file: string): Record<string, string[]> {
  const s = readFileSync(new URL(`../prisma/${file}`, import.meta.url), 'utf8');
  const out: Record<string, string[]> = {};
  for (const m of s.matchAll(/^model (\w+) \{(.*?)^\}/gms)) {
    out[m[1]!] = m[2]!.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter((l) => l && !l.startsWith('//'));
  }
  return out;
}

describe('schema parity', () => {
  it('sqlite and postgres schemas hold the same models and fields', () => {
    const a = models('schema.prisma');
    const b = models('schema.postgres.prisma');
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    const diff = Object.keys(a).filter((k) => JSON.stringify([...a[k]!].sort()) !== JSON.stringify([...(b[k] ?? [])].sort()));
    expect(diff).toEqual([]);
  });
});
