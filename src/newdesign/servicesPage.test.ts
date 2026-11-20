import { describe, expect, it } from 'vitest';
import { servicesErrorKey } from './ServicesPage';
import { en } from '../i18n/messages/en';

describe('service preparation messages', () => {
  it('turns server codes into messages that exist', () => {
    for (const code of ['ALREADY_EXISTS', 'WHO', 'FORBIDDEN', 'LAST_ROLE', 'NOPE', undefined]) {
      expect(en[servicesErrorKey(code) as keyof typeof en]).toBeTruthy();
    }
  });
  it('has a menu label and a tile text', () => {
    expect(en['door.own.services']).toBeTruthy();
    expect(en['door.tile.own.services']).toBeTruthy();
  });
});
