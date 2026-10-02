/** Window maths for a carousel that shows a few cards with one in focus. */

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * First visible card when `focus` is the focused one. The focused card sits in
 * the middle of the window, except near either end, where the window stops
 * and the focus moves to the first or last card instead.
 */
export function windowStart(focus: number, count: number, size = 3): number {
  const visible = Math.min(size, Math.max(count, 0));
  if (visible <= 0) return 0;
  const middle = Math.floor((visible - 1) / 2);
  return Math.min(Math.max(0, count - visible), Math.max(0, focus - middle));
}

/** Position (0-based) of the focused card inside the visible window. */
export function focusSlot(focus: number, count: number, size = 3): number {
  return clampIndex(focus, count) - windowStart(focus, count, size);
}

/** Next focus after a horizontal drag of `dx` px (drag left = next card). */
export function focusAfterDrag(
  focus: number,
  count: number,
  dx: number,
  threshold = 40,
): number {
  if (dx <= -threshold) return clampIndex(focus + 1, count);
  if (dx >= threshold) return clampIndex(focus - 1, count);
  return focus;
}
