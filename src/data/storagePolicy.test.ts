import { describe, expect, it } from 'vitest';
import { registerAllLocalDomain } from './registerLocalDomain';
import { registeredCollectionNames } from './localDomainStore';
import { STORAGE_POLICY, MODULE_COLLECTIONS } from './storagePolicy';

describe('browser storage policy', () => {
  registerAllLocalDomain();
  const registered = registeredCollectionNames();

  it('every collection the browser saves has a decided home', () => {
    const unclassified = registered.filter((n) => !(n in STORAGE_POLICY));
    expect(unclassified, `Classify these in src/data/storagePolicy.ts: ${unclassified.join(', ')}`).toEqual([]);
  });
  it('the policy lists nothing that no longer exists', () => {
    const gone = Object.keys(STORAGE_POLICY).filter((n) => !registered.includes(n));
    expect(gone, `Remove from storagePolicy.ts: ${gone.join(', ')}`).toEqual([]);
  });
  it('module switches only name classified collections', () => {
    for (const cols of Object.values(MODULE_COLLECTIONS)) for (const c of cols) expect(STORAGE_POLICY).toHaveProperty(c);
  });
});
