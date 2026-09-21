import { describe, expect, it } from 'vitest';
import { canSubmitForSignature } from './CorrespondencePage';

describe('canSubmitForSignature', () => {
  it('blocks the signer from submitting for signature', () => {
    expect(canSubmitForSignature(true, true)).toBe(false);
  });

  it('allows the office preparer to submit for signature', () => {
    expect(canSubmitForSignature(true, false)).toBe(true);
  });

  it('blocks non-preparers', () => {
    expect(canSubmitForSignature(false, false)).toBe(false);
  });
});
