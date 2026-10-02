import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CROP,
  ZOOM_MAX,
  clampCrop,
  cropRect,
  fitWithin,
  panCrop,
} from './photo';

describe('fitWithin', () => {
  it('shrinks the longest side to the max and keeps the ratio', () => {
    expect(fitWithin(1024, 512, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(500, 1000, 256)).toEqual({ width: 128, height: 256 });
  });
  it('never enlarges a small image', () => {
    expect(fitWithin(100, 80, 256)).toEqual({ width: 100, height: 80 });
  });
  it('handles empty images', () => {
    expect(fitWithin(0, 50)).toEqual({ width: 0, height: 0 });
  });
});

describe('crop maths', () => {
  it('at zoom 1 the crop is the centred square of a landscape image', () => {
    const r = cropRect(800, 400, DEFAULT_CROP);
    expect(r).toEqual({ sx: 200, sy: 0, side: 400 });
  });
  it('zooming in shrinks the visible square', () => {
    expect(cropRect(400, 400, { zoom: 2, cx: 0.5, cy: 0.5 }).side).toBe(200);
  });
  it('clamps zoom to the allowed range', () => {
    expect(clampCrop(400, 400, { zoom: 99, cx: 0.5, cy: 0.5 }).zoom).toBe(ZOOM_MAX);
    expect(clampCrop(400, 400, { zoom: 0.2, cx: 0.5, cy: 0.5 }).zoom).toBe(1);
  });
  it('never lets the crop leave the picture', () => {
    const c = clampCrop(400, 400, { zoom: 2, cx: 0, cy: 1 });
    expect(c.cx).toBeCloseTo(0.25);
    expect(c.cy).toBeCloseTo(0.75);
    const r = cropRect(400, 400, { zoom: 2, cx: 0, cy: 1 });
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.side).toBeLessThanOrEqual(400);
  });
  it('dragging right moves the visible area left, and stops at the edge', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 };
    const moved = panCrop(400, 400, start, 50, 0, 200);
    expect(moved.cx).toBeLessThan(0.5);
    const far = panCrop(400, 400, start, 99999, 0, 200);
    expect(far.cx).toBeCloseTo(0.25);
  });
  it('cannot pan at zoom 1 on a square image', () => {
    const moved = panCrop(400, 400, DEFAULT_CROP, 80, 80, 200);
    expect(moved).toEqual(DEFAULT_CROP);
  });
});
