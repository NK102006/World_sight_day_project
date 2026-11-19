import React, { useEffect, useRef, useState } from 'react';
import { X, Move } from 'lucide-react';
import { DEFAULT_ADJUST, maxOffset, renderAdjustedSquare } from '../services/imageAdjust';

const RENDER_SIZE = 560;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Keep offsets inside the allowed range so the photo always covers the square
const normalise = (a) => {
  const m = maxOffset(a);
  return { ...a, offsetX: clamp(a.offsetX, -m, m), offsetY: clamp(a.offsetY, -m, m) };
};

/**
 * PhotoEditor.jsx
 * Pop-up editor with no sliders. Everything is done on the canvas with the mouse or trackpad:
 *  - drag with the mouse to move the photo
 *  - two-finger scroll on a trackpad (or the wheel) to move the photo
 *  - pinch on a trackpad, or Ctrl + scroll on a mouse, to zoom
 *  - touch: drag with one finger, pinch with two
 * Nothing is applied until Apply is pressed.
 */
export default function PhotoEditor({ src, initial, onApply, onCancel }) {
  const [draft, setDraft] = useState(() => normalise({ ...DEFAULT_ADJUST, ...initial }));
  const [img, setImg] = useState(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const last = useRef(null);
  const pinch = useRef(null);

  // Load the photo
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => !cancelled && setImg(image);
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Redraw whenever the photo or the view changes
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const rendered = renderAdjustedSquare(img, draft, RENDER_SIZE);
    ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    ctx.drawImage(rendered, 0, 0);
  }, [img, draft]);

  // Escape closes the editor
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Trackpad and wheel. Non-passive so the page does not scroll behind the editor.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const width = el.getBoundingClientRect().width || 1;
      const lineScale = e.deltaMode === 1 ? 16 : 1; // some mice report lines, not pixels
      const dx = e.deltaX * lineScale;
      const dy = e.deltaY * lineScale;
      if (e.ctrlKey) {
        // Pinch on a trackpad arrives as ctrl+wheel; Ctrl + scroll on a mouse does the same
        setDraft((prev) => normalise({ ...prev, zoom: clamp(prev.zoom * Math.exp(-dy * 0.004), MIN_ZOOM, MAX_ZOOM) }));
      } else {
        // Two-finger scroll moves the photo, like dragging it
        setDraft((prev) => normalise({ ...prev, offsetX: prev.offsetX - dx / width, offsetY: prev.offsetY - dy / width }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      last.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.current.size === 2) {
      pinch.current = { dist: dist(), zoom: draft.zoom };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const ratio = dist() / pinch.current.dist;
      setDraft((prev) => normalise({ ...prev, zoom: clamp(pinch.current.zoom * ratio, MIN_ZOOM, MAX_ZOOM) }));
    } else if (pointers.current.size === 1 && last.current) {
      const width = e.currentTarget.getBoundingClientRect().width || 1;
      const dx = (e.clientX - last.current.x) / width;
      const dy = (e.clientY - last.current.y) / width;
      last.current = { x: e.clientX, y: e.clientY };
      setDraft((prev) => normalise({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    const [remaining] = [...pointers.current.values()];
    last.current = remaining ? { x: remaining.x, y: remaining.y } : null;
  };

  const reset = () => setDraft(normalise({ ...DEFAULT_ADJUST }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stage/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Adjust photo">
      <div className="settle flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Adjust your photo</h2>
            <p className="text-xs text-slate-500">Position the face inside the square, then press Apply.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-[460px]">
            <div
              ref={frameRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-slate-900 shadow-inner ring-1 ring-slate-900/10 active:cursor-grabbing"
            >
              <canvas ref={canvasRef} width={RENDER_SIZE} height={RENDER_SIZE} className="h-full w-full" />

              {/* Rule-of-thirds guide */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
              </div>

              <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur">
                <Move className="h-3 w-3" /> Drag to move, pinch or Ctrl + scroll to zoom
              </div>

              <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-2.5 py-1 font-mono text-[11px] text-white/90 backdrop-blur">
                {Math.round(draft.zoom * 100)}%
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            Trackpad: drag with one finger or two-finger scroll to move, pinch to zoom.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={reset} className="rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Reset
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" onClick={() => onApply(draft)} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stage-raised">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
