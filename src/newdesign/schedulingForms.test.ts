import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { preserveRelaxableKinds, schedulingError } from './schedulingForms';

describe('scheduling form helpers', () => {
  it('preserves unsupported relaxation codes while updating selected supported ones', () => {
    expect(preserveRelaxableKinds(['ss3', 'CUSTOM'], ['TUESDAY'], new Set(['SS3', 'TUESDAY']))).toEqual(['CUSTOM', 'TUESDAY']);
  });

  it('shows actionable validation issues from a 4xx and withholds server errors', () => {
    expect(schedulingError(new ApiError('x', 409, { error: 'Resolve rules', issues: ['Choose a period', { message: 'Link Grace Choir' }] })))
      .toBe('Resolve rules · Choose a period · Link Grace Choir');
    expect(schedulingError(new ApiError('x', 500, { error: 'Internal details' }))).toBeNull();
    expect(schedulingError(new Error('plain'))).toBeNull();
  });

  it('lists every validation error from a 422 save', () => {
    expect(schedulingError(new ApiError('x', 422, { errors: ['Service needs a weekday.', 'Choir has no category.'] })))
      .toBe('Service needs a weekday. · Choir has no category.');
  });

  it('shows the edit-lock and frozen-schedule messages from a 409', () => {
    expect(schedulingError(new ApiError('x', 409, { code: 'LOCKED', message: 'Grace is editing.' }))).toBe('Grace is editing.');
    expect(schedulingError(new ApiError('x', 409, { code: 'SCHEDULE_FROZEN', message: 'This month is confirmed.' }))).toBe('This month is confirmed.');
  });

  it('does not repeat a message that appears twice', () => {
    expect(schedulingError(new ApiError('x', 400, { error: 'Same', message: 'Same' }))).toBe('Same');
  });
});
