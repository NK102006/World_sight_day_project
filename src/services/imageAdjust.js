// ============================================================================
// services/imageAdjust.js
// Pure photo adjustments applied BEFORE face detection, so eye positions
// always match what the user sees. Zoom, pan, rotate, brightness, contrast.
// ============================================================================

export const DEFAULT_ADJUST = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotate: 0,
  brightness: 100,
  contrast: 100,
};

export const isDefaultAdjust = (a) =>
  Object.keys(DEFAULT_ADJUST).every((k) => a[k] === DEFAULT_ADJUST[k]);

const rad = (deg) => (deg * Math.PI) / 180;

/** Zoom needed so a rotated square still fills the output (no black corners). */
export function coverZoom(a) {
  const t = Math.abs(rad(a.rotate));
  return a.zoom * (Math.cos(t) + Math.sin(t));
}

/** Largest pan (as a fraction of the output size) that keeps the photo covering the square. */
export function maxOffset(a) {
  return Math.max(0, (coverZoom(a) - 1) / 2);
}

/**
 * Draw the photo as a square of `size` pixels with all adjustments applied.
 * @returns HTMLCanvasElement
 */
export function renderAdjustedSquare(img, a, size = 1000) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const minDim = Math.min(w, h);
  const m = maxOffset(a);
  const ox = Math.max(-m, Math.min(m, a.offsetX));
  const oy = Math.max(-m, Math.min(m, a.offsetY));

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2 + ox * size, size / 2 + oy * size);
  ctx.rotate(rad(a.rotate));
  const s = (size / minDim) * coverZoom(a);
  ctx.scale(s, s);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  if (a.brightness !== 100 || a.contrast !== 100) {
    const data = ctx.getImageData(0, 0, size, size);
    const d = data.data;
    const b = a.brightness / 100;
    const c = a.contrast / 100;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        let v = d[i + k] * b;
        v = (v - 128) * c + 128;
        d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}
