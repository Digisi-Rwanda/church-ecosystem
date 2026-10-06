import { describe, expect, it } from 'vitest';
import { exportAllLocalData, registeredCollectionNames } from './localDomainStore';
import { registerAllLocalDomain } from './registerLocalDomain';

describe('local data backup', () => {
  it('covers every registered collection and is plain JSON', () => {
    registerAllLocalDomain();
    const b = exportAllLocalData();
    expect(b.format).toBe('church-ecosystem-local-backup');
    expect(registeredCollectionNames().length).toBeGreaterThan(30);
    expect(Object.keys(b.collections).length).toBeGreaterThan(25);
    expect(() => JSON.parse(JSON.stringify(b))).not.toThrow();
  });
});
