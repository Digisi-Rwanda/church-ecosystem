/** Maths for a coverflow carousel: where each card sits relative to the centre. */

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

export type CardPose = {
  transform: string;
  opacity: number;
  zIndex: number;
  /** Too far from the centre to draw at all. */
  hidden: boolean;
};

/** How many cards are drawn on each side of the centre one. */
export const VISIBLE_SIDE = 3;

/**
 * Pose of the card `offset` places from the centre (0 = centre, negative =
 * left). Side cards turn towards the centre and sink back; the farthest fade.
 */
export function cardPose(offset: number, cardWidth: number): CardPose {
  const d = Math.abs(offset);
  const sign = Math.sign(offset);
  const hidden = d > VISIBLE_SIDE;
  if (offset === 0) {
    return {
      transform: 'translateX(0px) translateZ(0px) rotateY(0deg) scale(1)',
      opacity: 1,
      zIndex: 100,
      hidden: false,
    };
  }
  const x = sign * (cardWidth * 0.66 + (d - 1) * cardWidth * 0.3);
  const z = -90 - (d - 1) * 60;
  return {
    transform: `translateX(${Math.round(x)}px) translateZ(${z}px) rotateY(${-sign * 48}deg) scale(0.92)`,
    // Opaque so cards never show through each other; only the far ones fade.
    opacity: hidden ? 0 : d <= 2 ? 1 : 0.55,
    zIndex: 100 - d,
    hidden,
  };
}

/** Next index after a horizontal drag of `dx` px (drag left = next card). */
export function indexAfterDrag(
  index: number,
  count: number,
  dx: number,
  threshold = 40,
): number {
  if (dx <= -threshold) return clampIndex(index + 1, count);
  if (dx >= threshold) return clampIndex(index - 1, count);
  return index;
}
