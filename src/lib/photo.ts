/** Side (px) of the round picture and of the full-quality copy kept for editing. */
export const PHOTO_OUT_SIDE = 512;
export const PHOTO_SOURCE_MAX_SIDE = 2048;
export const JPEG_QUALITY = 0.92;
export const PHOTO_MAX_BYTES = 30 * 1024 * 1024;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/** Size to draw an image so its longest side is at most `max` (never enlarges). */
export function fitWithin(
  width: number,
  height: number,
  max = PHOTO_SOURCE_MAX_SIDE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type CropState = {
  /** 1 = the picture just covers the frame; higher zooms in. */
  zoom: number;
  /** Centre of the visible area, as a 0–1 fraction of the image. */
  cx: number;
  cy: number;
};

export const DEFAULT_CROP: CropState = { zoom: 1, cx: 0.5, cy: 0.5 };

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Side of the square (in image pixels) that is visible at this zoom. */
export function visibleSide(w: number, h: number, zoom: number): number {
  return Math.min(w, h) / clampZoom(zoom);
}

/** Keep the visible square inside the image. */
export function clampCrop(w: number, h: number, crop: CropState): CropState {
  const zoom = clampZoom(crop.zoom);
  const side = visibleSide(w, h, zoom);
  const halfX = side / 2 / w;
  const halfY = side / 2 / h;
  return {
    zoom,
    cx: Math.min(1 - halfX, Math.max(halfX, crop.cx)),
    cy: Math.min(1 - halfY, Math.max(halfY, crop.cy)),
  };
}

/** Source rectangle (image pixels) to copy for the current crop. */
export function cropRect(w: number, h: number, crop: CropState) {
  const c = clampCrop(w, h, crop);
  const side = visibleSide(w, h, c.zoom);
  return {
    sx: c.cx * w - side / 2,
    sy: c.cy * h - side / 2,
    side,
  };
}

/** Move the crop by a drag of (dx, dy) screen pixels on a frame of `frame` px. */
export function panCrop(
  w: number,
  h: number,
  crop: CropState,
  dx: number,
  dy: number,
  frame: number,
): CropState {
  const side = visibleSide(w, h, crop.zoom);
  const imagePerScreen = side / frame;
  return clampCrop(w, h, {
    ...crop,
    cx: crop.cx - (dx * imagePerScreen) / w,
    cy: crop.cy - (dy * imagePerScreen) / h,
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file'));
    r.readAsDataURL(file);
  });
}

function drawScaled(img: HTMLImageElement, max: number): string {
  const size = fitWithin(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Picked file → the editable source. A picture that is already small enough
 * is kept exactly as it is (no re-compression); only oversized ones are shrunk.
 */
export async function fileToSourceDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error('That image is too large (max 30 MB)');
  }
  const original = await readFile(file);
  const img = await loadImage(original);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= PHOTO_SOURCE_MAX_SIDE) return original;
  return drawScaled(img, PHOTO_SOURCE_MAX_SIDE);
}

/** Rotate a data-URL image by 90° steps (positive = clockwise). */
export async function rotateDataUrl(
  src: string,
  quarterTurns: number,
): Promise<string> {
  const img = await loadImage(src);
  const turns = ((quarterTurns % 4) + 4) % 4;
  const swap = turns % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/** Cut the chosen square out of the source and shrink it for storage. */
export async function renderCrop(
  src: string,
  crop: CropState,
  out = PHOTO_OUT_SIDE,
): Promise<string> {
  const img = await loadImage(src);
  const r = cropRect(img.naturalWidth, img.naturalHeight, crop);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, out, out);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
