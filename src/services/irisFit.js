// ============================================================================
// services/irisFit.js
// Pure, DOM-free iris geometry. Works on any {data, width, height} RGBA image
// (ImageData, or a plain object in Node tests).
//
// Model: the iris is a CIRCLE (cx, cy, r). Eyelids hide part of it, so the
// visible iris = circle ∩ eyelid-opening polygon. (The old code squashed the
// iris into an ellipse whose height was the eyelid opening, which is wrong:
// it cut off the iris corners and left skin/lash pixels inside the mask.)
//
// Fitting uses a constrained Daugman-style integro-differential search:
//  - only the LEFT and RIGHT arcs are scored (top/bottom are hidden by lids)
//  - samples near/outside the eyelid polygon are ignored (lash line = fake edge)
//  - BOTH sides must support the circle (stops locking onto glasses frames)
//  - a prior pulls the answer toward the landmark estimate, and if the image
//    evidence is weak we simply keep the landmark estimate.
// ============================================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function lumaWindow(img, x0, y0, w, h) {
  const out = new Float32Array(w * h);
  const { data, width, height } = img;
  for (let y = 0; y < h; y++) {
    const sy = clamp(y0 + y, 0, height - 1);
    for (let x = 0; x < w; x++) {
      const sx = clamp(x0 + x, 0, width - 1);
      const i = (sy * width + sx) * 4;
      out[y * w + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return out;
}

// Separable [1 2 1]/4 blur (~sigma 0.7). Removes JPEG noise before gradients.
function blur3(src, w, h) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = src[y * w + Math.max(0, x - 1)];
      const b = src[y * w + x];
      const c = src[y * w + Math.min(w - 1, x + 1)];
      tmp[y * w + x] = (a + 2 * b + c) * 0.25;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = tmp[Math.max(0, y - 1) * w + x];
      const b = tmp[y * w + x];
      const c = tmp[Math.min(h - 1, y + 1) * w + x];
      out[y * w + x] = (a + 2 * b + c) * 0.25;
    }
  }
  return out;
}

function makeSampler(L, w, h) {
  return (x, y) => {
    const fx = clamp(x, 0, w - 1.001);
    const fy = clamp(y, 0, h - 1.001);
    const xi = fx | 0;
    const yi = fy | 0;
    const tx = fx - xi;
    const ty = fy - yi;
    const i = yi * w + xi;
    return (
      L[i] * (1 - tx) * (1 - ty) +
      L[i + 1] * tx * (1 - ty) +
      L[i + w] * (1 - tx) * ty +
      L[i + w + 1] * tx * ty
    );
  };
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

/** Chaikin corner-cutting: turns MediaPipe's coarse 16-point lid ring into a smooth closed curve. */
export function smoothClosedPolygon(poly, iterations = 2) {
  let pts = poly.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations; it++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    pts = next;
  }
  return pts;
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed distance to polygon edge in px: positive inside, negative outside. */
export function signedDistToPoly(px, py, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x;
    const ay = poly[j].y;
    const bx = poly[i].x;
    const by = poly[i].y;
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return pointInPoly(px, py, poly) ? best : -best;
}

/**
 * When no landmark eyelid contour exists (fallback detector / manual placement),
 * build a plausible almond-shaped eye opening around the iris circle.
 */
export function almondPolygon(cx, cy, r) {
  const pts = [];
  const half = 2.1 * r;
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    pts.push({ x: cx + t * half, y: cy - 0.86 * r * (1 - t * t) + 0.05 * r });
  }
  for (let i = n - 1; i >= 1; i--) {
    const t = -1 + (2 * i) / n;
    pts.push({ x: cx + t * half, y: cy + 0.78 * r * (1 - t * t) + 0.05 * r });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Iris circle fit
// ---------------------------------------------------------------------------

/**
 * @param img   {data,width,height} RGBA
 * @param seed  {x,y,r} in image pixels (landmark estimate)
 * @param opts  { lidPoly: [{x,y}] px | null, maxShift, rangeLo, rangeHi }
 * @returns {x,y,r,score,confidence,usedPrior}  (px)
 */
export function fitIrisCircle(img, seed, opts = {}) {
  const { lidPoly = null, maxShift = 0.35, rangeLo = 0.8, rangeHi = 1.25 } = opts;
  const R0 = Math.max(4, seed.r);
  const pad = Math.ceil(R0 * 2.2) + 4;
  const x0 = Math.floor(seed.x) - pad;
  const y0 = Math.floor(seed.y) - pad;
  const w = 2 * pad + 1;
  const h = 2 * pad + 1;

  const L = blur3(blur3(lumaWindow(img, x0, y0, w, h), w, h), w, h);
  const S = makeSampler(L, w, h);
  const sx = seed.x - x0;
  const sy = seed.y - y0;

  // Precompute distance-inside-eyelid map once (lookup is much cheaper than per-sample polygon tests)
  let lidDist = null;
  if (lidPoly && lidPoly.length >= 6) {
    const local = lidPoly.map((p) => ({ x: p.x - x0, y: p.y - y0 }));
    lidDist = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) lidDist[y * w + x] = signedDistToPoly(x, y, local);
    }
  }
  const insideLid = (x, y, margin) => {
    if (!lidDist) return true;
    const xi = clamp(Math.round(x), 0, w - 1);
    const yi = clamp(Math.round(y), 0, h - 1);
    return lidDist[yi * w + xi] >= margin;
  };

  const deg = Math.PI / 180;
  const rightAngles = [];
  const leftAngles = [];
  for (let a = -40; a <= 40; a += 5) {
    rightAngles.push([Math.cos(a * deg), Math.sin(a * deg)]);
    leftAngles.push([-Math.cos(a * deg), Math.sin(a * deg)]);
  }
  const D = 1.6; // half-width of the radial derivative

  const evalCircle = (cx, cy, r) => {
    const side = (angles) => {
      let sum = 0;
      let n = 0;
      for (const [ca, sa] of angles) {
        const px = cx + r * ca;
        const py = cy + r * sa;
        if (!insideLid(px, py, 2.0)) continue;
        const g = S(cx + (r + D) * ca, cy + (r + D) * sa) - S(cx + (r - D) * ca, cy + (r - D) * sa);
        sum += clamp(g, -30, 40);
        n++;
      }
      return n >= 3 ? sum / n : null;
    };
    const mR = side(rightAngles);
    const mL = side(leftAngles);
    let s;
    if (mR !== null && mL !== null) s = 0.6 * Math.min(mR, mL) + 0.4 * 0.5 * (mR + mL);
    else if (mR !== null || mL !== null) s = 0.5 * (mR !== null ? mR : mL);
    else return -1e9;
    // prior toward the landmark estimate
    const dc = Math.hypot(cx - sx, cy - sy);
    const dr = r - R0;
    return s - (2.5 * dc * dc) / R0 - (6 * dr * dr) / R0;
  };

  let best = { s: -1e9, cx: sx, cy: sy, r: R0 };
  const shift = maxShift * R0;
  for (let cy = sy - shift; cy <= sy + shift; cy += 1) {
    for (let cx = sx - shift; cx <= sx + shift; cx += 1) {
      for (let r = R0 * rangeLo; r <= R0 * rangeHi; r += 0.5) {
        const s = evalCircle(cx, cy, r);
        if (s > best.s) best = { s, cx, cy, r };
      }
    }
  }
  // fine pass
  const c0 = best;
  for (let cy = c0.cy - 1; cy <= c0.cy + 1; cy += 0.25) {
    for (let cx = c0.cx - 1; cx <= c0.cx + 1; cx += 0.25) {
      for (let r = c0.r - 1; r <= c0.r + 1; r += 0.25) {
        const s = evalCircle(cx, cy, r);
        if (s > best.s) best = { s, cx, cy, r };
      }
    }
  }

  const confidence = clamp(best.s / 14, 0, 1);
  if (best.s < 3) {
    // weak/ambiguous image evidence -> trust the landmark estimate
    return { x: seed.x, y: seed.y, r: R0, score: best.s, confidence: 0, usedPrior: true };
  }
  return {
    x: x0 + best.cx,
    y: y0 + best.cy,
    r: best.r,
    score: best.s,
    confidence,
    usedPrior: false,
  };
}
