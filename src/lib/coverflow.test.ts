import { describe, expect, it } from 'vitest';
import {
  VISIBLE_SIDE,
  cardPose,
  clampIndex,
  indexAfterDrag,
} from './coverflow';

describe('coverflow', () => {
  it('clamps the index to the cards that exist', () => {
    expect(clampIndex(-3, 16)).toBe(0);
    expect(clampIndex(99, 16)).toBe(15);
    expect(clampIndex(5, 0)).toBe(0);
  });

  it('the centre card is flat, full size and on top', () => {
    const p = cardPose(0, 260);
    expect(p.transform).toContain('rotateY(0deg)');
    expect(p.opacity).toBe(1);
    expect(p.zIndex).toBe(100);
    expect(p.hidden).toBe(false);
  });

  it('side cards mirror each other and turn towards the centre', () => {
    const right = cardPose(1, 260);
    const left = cardPose(-1, 260);
    expect(right.transform).toContain('translateX(172px)');
    expect(left.transform).toContain('translateX(-172px)');
    expect(right.transform).toContain('rotateY(-48deg)');
    expect(left.transform).toContain('rotateY(48deg)');
  });

  it('cards further away sit further out and further back; the farthest fade', () => {
    const a = cardPose(1, 260);
    const b = cardPose(2, 260);
    expect(b.zIndex).toBeLessThan(a.zIndex);
    expect(b.transform).toContain('translateX(250px)');
    expect(b.opacity).toBe(1);
    expect(cardPose(3, 260).opacity).toBeLessThan(1);
  });

  it('hides cards beyond the visible range', () => {
    expect(cardPose(VISIBLE_SIDE, 260).hidden).toBe(false);
    expect(cardPose(VISIBLE_SIDE + 1, 260).hidden).toBe(true);
    expect(cardPose(-(VISIBLE_SIDE + 1), 260).opacity).toBe(0);
  });

  it('dragging left goes forward, right goes back, small drags do nothing', () => {
    expect(indexAfterDrag(3, 16, -80)).toBe(4);
    expect(indexAfterDrag(3, 16, 80)).toBe(2);
    expect(indexAfterDrag(3, 16, 10)).toBe(3);
    expect(indexAfterDrag(0, 16, 80)).toBe(0);
    expect(indexAfterDrag(15, 16, -80)).toBe(15);
  });
});
