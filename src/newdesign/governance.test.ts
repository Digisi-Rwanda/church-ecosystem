import { describe, expect, it } from 'vitest';
import { decisionProblem, toIso } from './governance';

describe('governance helpers', () => {
  it('needs a title and a unit or meeting', () => {
    expect(decisionProblem({ title: '', work: false, ownerId: '', due: '', unitId: '' })).toBeTruthy();
  });
  it('turns an empty date into null', () => {
    expect(toIso('')).toBeFalsy();
  });
});
