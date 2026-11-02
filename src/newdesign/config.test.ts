import { describe, expect, it } from 'vitest';
import type { MessageKey } from '../i18n/messages/en';
import { weekdayName, musicSetupStep, MUSIC_SETUP_STEPS } from './config';

describe('scheduling configuration translations', () => {
  it('keeps all legacy Music sections in their corresponding setup step', () => {
    expect(MUSIC_SETUP_STEPS).toEqual(['services','links','policies','review']);
    for (const tab of ['categories','links']) expect(musicSetupStep(tab)).toBe(1);
    for (const tab of ['policies','fixed','availability']) expect(musicSetupStep(tab)).toBe(2);
    expect(musicSetupStep('review')).toBe(3);
  });
  it('uses the translated key for integer weekdays only', () => {
    const keyOf = (key: MessageKey) => key;

    expect(weekdayName(keyOf, 0)).toBe('door.caring.weekday.0');
    expect(weekdayName(keyOf, 6)).toBe('door.caring.weekday.6');
    expect(weekdayName(keyOf, 1.5)).toBe('');
    expect(weekdayName(keyOf, 7)).toBe('');
    expect(weekdayName(keyOf, null)).toBe('');
  });
});
