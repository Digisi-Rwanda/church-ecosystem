import { describe, expect, it } from 'vitest';
import { matchesText } from './SearchBox';

describe('matchesText', () => {
  it('ignores capitals and accents and wants every word', () => {
    expect(matchesText('YOUTH retreat', 'The youth Retreat plan')).toBe(true);
    expect(matchesText('cafe', 'Café')).toBe(true);
    expect(matchesText('youth choir', 'Youth retreat')).toBe(false);
  });
  it('an empty search keeps everything', () => {
    expect(matchesText('  ', 'anything')).toBe(true);
    expect(matchesText('', null)).toBe(true);
  });
});
