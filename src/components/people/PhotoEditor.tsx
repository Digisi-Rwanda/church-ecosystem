import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CROP,
  ZOOM_MAX,
  ZOOM_MIN,
  clampCrop,
  clampZoom,
  loadImage,
  panCrop,
  renderCrop,
  rotateDataUrl,
  type CropState,
} from '../../lib/photo';

const FRAME = 280;

/**
 * Modal to position a picture: drag to move, slider / buttons / wheel to
 * zoom, rotate, reset. The circle shows exactly what the avatar will show.
 */
export function PhotoEditor({
  source,
  onApply,
  onCancel,
}: {
  source: string;
  onApply: (result: { photoUrl: string; photoSource: string }) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState(source);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadImage(src)
      .then((img) => {
        if (live) setSize({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load');
      });
    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Frame geometry: the image is drawn so the visible square fills the frame.
  const view = (() => {
    if (!size) return null;
    const c = clampCrop(size.w, size.h, crop);
    const side = Math.min(size.w, size.h) / c.zoom;
    const scale = FRAME / side;
    return {
      width: size.w * scale,
      height: size.h * scale,
      left: FRAME / 2 - c.cx * size.w * scale,
      top: FRAME / 2 - c.cy * size.h * scale,
    };
  })();

  function setZoom(next: number) {
    if (!size) return;
    setCrop((c) => clampCrop(size.w, size.h, { ...c, zoom: clampZoom(next) }));
  }

  async function rotate(turns: number) {
    setBusy(true);
    try {
      setSrc(await rotateDataUrl(src, turns));
      setCrop(DEFAULT_CROP);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rotate');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const photoUrl = await renderCrop(src, crop);
      onApply({ photoUrl, photoSource: src });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo');
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal photo-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Edit photo"
        tabIndex={-1}
        ref={dialogRef}
      >
        <h3 className="modal-title">Edit photo</h3>
        <div
          className="pe-frame"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current || !size) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setCrop((c) => panCrop(size.w, size.h, c, dx, dy, FRAME));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onWheel={(e) => setZoom(crop.zoom - e.deltaY * 0.002)}
        >
          {view ? (
            <img
              src={src}
              alt="Photo being edited"
              draggable={false}
              style={{
                width: view.width,
                height: view.height,
                left: view.left,
                top: view.top,
              }}
            />
          ) : (
            <span className="muted pe-loading">{error || 'Loading…'}</span>
          )}
          <span className="pe-mask" aria-hidden />
        </div>
        <p className="muted pe-hint">Drag to move · scroll or use the slider to zoom</p>

        <div className="pe-controls">
          <button
            type="button"
            className="btn ghost sm"
            aria-label="Zoom out"
            onClick={() => setZoom(crop.zoom - 0.25)}
          >
            −
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <button
            type="button"
            className="btn ghost sm"
            aria-label="Zoom in"
            onClick={() => setZoom(crop.zoom + 0.25)}
          >
            +
          </button>
        </div>
        <div className="pe-controls">
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void rotate(-1)}>
            ↺ Rotate left
          </button>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void rotate(1)}>
            ↻ Rotate right
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setCrop(DEFAULT_CROP)}>
            Reset
          </button>
        </div>
        {error && size ? <p className="pe-error">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !size}
            onClick={() => void apply()}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
