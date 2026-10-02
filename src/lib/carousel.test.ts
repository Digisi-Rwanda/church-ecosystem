import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  focusAfterDrag,
  focusSlot,
  windowStart,
} from './carousel';

const N = 16;

describe('carousel window', () => {
  it('shows three cards with the focused one in the middle', () => {
    expect(windowStart(5, N)).toBe(4);
    expect(focusSlot(5, N)).toBe(1);
    expect(windowStart(1, N)).toBe(0);
    expect(focusSlot(1, N)).toBe(1);
  });

  it('on the first card the window stays put and the focus is on the left', () => {
    expect(windowStart(0, N)).toBe(0);
    expect(focusSlot(0, N)).toBe(0);
  });

  it('on the last card the window stays put and the focus is on the right', () => {
    expect(windowStart(15, N)).toBe(13);
    expect(focusSlot(15, N)).toBe(2);
    expect(windowStart(14, N)).toBe(13);
    expect(focusSlot(14, N)).toBe(1);
  });

  it('walking through every card never leaves the window out of range', () => {
    for (let f = 0; f < N; f++) {
      const s = windowStart(f, N);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s + 3).toBeLessThanOrEqual(N);
      expect(focusSlot(f, N)).toBeGreaterThanOrEqual(0);
      expect(focusSlot(f, N)).toBeLessThanOrEqual(2);
    }
  });

  it('works with fewer cards than the window, and with one visible card', () => {
    expect(windowStart(1, 2)).toBe(0);
    expect(focusSlot(1, 2)).toBe(1);
    expect(windowStart(7, N, 1)).toBe(7);
    expect(focusSlot(7, N, 1)).toBe(0);
    expect(windowStart(0, 0)).toBe(0);
  });

  it('clamps and handles drags', () => {
    expect(clampIndex(-2, N)).toBe(0);
    expect(clampIndex(99, N)).toBe(15);
    expect(focusAfterDrag(3, N, -80)).toBe(4);
    expect(focusAfterDrag(3, N, 80)).toBe(2);
    expect(focusAfterDrag(3, N, 10)).toBe(3);
    expect(focusAfterDrag(0, N, 80)).toBe(0);
    expect(focusAfterDrag(15, N, -80)).toBe(15);
  });
});
