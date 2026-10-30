import { describe, expect, it } from 'vitest';
import type { MessageKey } from '../i18n/messages/en';
import { weekdayName } from './config';

describe('scheduling configuration translations', () => {
  it('uses the translated key for integer weekdays only', () => {
    const keyOf = (key: MessageKey) => key;

    expect(weekdayName(keyOf, 0)).toBe('door.caring.weekday.0');
    expect(weekdayName(keyOf, 6)).toBe('door.caring.weekday.6');
    expect(weekdayName(keyOf, 1.5)).toBe('');
    expect(weekdayName(keyOf, 7)).toBe('');
    expect(weekdayName(keyOf, null)).toBe('');
  });
});
