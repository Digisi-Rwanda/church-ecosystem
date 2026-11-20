import { describe, expect, it } from 'vitest';
import { levelKeyOf } from './planLevels';

describe('levelKeyOf', () => {
  it('names the four steps in the order a plan passes them', () => {
    expect(['Treasurer', 'President', 'Catechist', 'Church Leader'].map(levelKeyOf)).toEqual(['TREASURER', 'UNIT', 'CATECHIST', 'CHURCH']);
  });
});
