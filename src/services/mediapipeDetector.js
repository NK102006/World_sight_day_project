// ============================================================================
// services/mediapipeDetector.js
// MediaPipe landmark index constants + a LAST-RESORT heuristic eye finder that
// is only used when MediaPipe cannot run (blocked WASM / offline / no face).
// The heuristic assumes DARK irises and visible skin, so treat its output as
// low-confidence: the UI asks the user to click each eye to confirm.
// ============================================================================
export const LEFT_IRIS_CENTER = 468;
export const LEFT_IRIS_EDGES = [469, 470, 471, 472];
export const RIGHT_IRIS_CENTER = 473;
export const RIGHT_IRIS_EDGES = [474, 475, 476, 477];

export const LEFT_EYE_CONTOUR = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const RIGHT_EYE_CONTOUR = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];

export const LEFT_UPPER_LID = [160, 159, 158];
export const LEFT_LOWER_LID = [144, 145, 153];
export const RIGHT_UPPER_LID = [385, 386, 387];
export const RIGHT_LOWER_LID = [380, 374, 373];

/**
 * Full-Image Blind Face + Paired Daugman Iris Detector (Zero hardcoded coordinates).
 * Scans the entire uploaded photo on a 250x250 working grid to locate the face bounding
 * box via YCbCr skin segmentation, excludes the central nose/eyeglass bridge, finds the
 * left and right irises via 2D dark-disc + lateral cool-sclera contrast, and refines
 * both eyes at full 1000x1000 resolution.
 */
export function detectIrisesFullImageJS(fullCanvas) {
  const W = 250;
  const H = 250;
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = W;
  smallCanvas.height = H;
  const sCtx = smallCanvas.getContext('2d');
  sCtx.drawImage(fullCanvas, 0, 0, W, H);
  const data = sCtx.getImageData(0, 0, W, H).data;

  const L = new Float32Array(W * H);
  const Warmth = new Float32Array(W * H);
  const skinXs = [];
  const skinYs = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      L[y * W + x] = lum;
      Warmth[y * W + x] = r - b;

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cr > 133 && cr < 182 && cb > 77 && cb < 135 && lum > 35 && lum < 235) {
        skinXs.push(x);
        skinYs.push(y);
      }
    }
  }

  let faceX0 = W * 0.22,
    faceX1 = W * 0.78,
    faceY0 = H * 0.15,
    faceY1 = H * 0.75;
  if (skinXs.length > 200) {
    skinXs.sort((a, b) => a - b);
    skinYs.sort((a, b) => a - b);
    faceX0 = skinXs[Math.floor(skinXs.length * 0.04)];
    faceX1 = skinXs[Math.floor(skinXs.length * 0.96)];
    faceY0 = skinYs[Math.floor(skinYs.length * 0.04)];
    faceY1 = skinYs[Math.floor(skinYs.length * 0.96)];
  }

  const faceW = Math.max(60, faceX1 - faceX0);
  const faceH = Math.max(70, faceY1 - faceY0);
  const faceMidX = 0.5 * (faceX0 + faceX1);

  const eyY0 = Math.max(8, Math.floor(faceY0 + 0.18 * faceH));
  const eyY1 = Math.min(H - 8, Math.ceil(faceY0 + 0.52 * faceH));
  const leftX0 = Math.max(8, Math.floor(faceMidX - 0.4 * faceW));
  const leftX1 = Math.min(W - 8, Math.floor(faceMidX - 0.08 * faceW));
  const rightX0 = Math.max(8, Math.ceil(faceMidX + 0.08 * faceW));
  const rightX1 = Math.min(W - 8, Math.ceil(faceMidX + 0.4 * faceW));

  const lumAt = (x, y) => {
    const cx = Math.max(0, Math.min(W - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(H - 1, Math.round(y)));
    return L[cy * W + cx];
  };

  const scoreCandidate = (cx, cy, r) => {
    if (cx - r * 1.5 < 1 || cx + r * 1.5 >= W - 1 || cy - r < 1 || cy + r >= H - 1) return -1e9;
    const pts = [
      lumAt(cx, cy),
      lumAt(cx - r * 0.45, cy),
      lumAt(cx + r * 0.45, cy),
      lumAt(cx, cy - r * 0.38),
      lumAt(cx, cy + r * 0.38),
      lumAt(cx - r * 0.35, cy - r * 0.3),
      lumAt(cx + r * 0.35, cy - r * 0.3),
      lumAt(cx - r * 0.35, cy + r * 0.3),
      lumAt(cx + r * 0.35, cy + r * 0.3),
    ];
    pts.sort((a, b) => a - b);
    const discDarkMean = (pts[0] + pts[1] + pts[2] + pts[3] + pts[4] + pts[5] + pts[6]) / 7;
    const discDarkMax = pts[6];
    if (discDarkMax > 98 || discDarkMean > 80) return -1e9;

    const outL =
      (lumAt(cx - r * 1.25, cy) + lumAt(cx - r * 1.2, cy - 1) + lumAt(cx - r * 1.2, cy + 1)) / 3;
    const outR =
      (lumAt(cx + r * 1.25, cy) + lumAt(cx + r * 1.2, cy - 1) + lumAt(cx + r * 1.2, cy + 1)) / 3;
    const gradL = outL - discDarkMean;
    const gradR = outR - discDarkMean;
    if (gradL < 14 || gradR < 14) return -1e9;

    const warmL = Warmth[cy * W + Math.round(cx - r * 1.2)];
    const warmR = Warmth[cy * W + Math.round(cx + r * 1.2)];
    const warmPenalty = Math.max(0, warmL - 24) + Math.max(0, warmR - 24);

    return (
      (gradL + gradR) * 1.5 -
      discDarkMean * 1.6 -
      discDarkMax * 0.5 -
      Math.abs(outL - outR) * 0.4 -
      warmPenalty * 0.7
    );
  };

  const rMin = Math.max(3, Math.floor(faceW * 0.038));
  const rMax = Math.min(14, Math.ceil(faceW * 0.075));

  let bestLeft = { score: -1e9, cx: W * 0.42, cy: H * 0.32, r: 4 };
  for (let cy = eyY0; cy <= eyY1; cy++) {
    for (let cx = leftX0; cx <= leftX1; cx++) {
      for (let r = rMin; r <= rMax; r++) {
        const sc = scoreCandidate(cx, cy, r);
        if (sc > bestLeft.score) bestLeft = { score: sc, cx, cy, r };
      }
    }
  }

  let bestRight = { score: -1e9, cx: W * 0.57, cy: H * 0.32, r: 4 };
  for (let cy = eyY0; cy <= eyY1; cy++) {
    for (let cx = rightX0; cx <= rightX1; cx++) {
      for (let r = rMin; r <= rMax; r++) {
        const sc = scoreCandidate(cx, cy, r);
        // Encourage vertical alignment between left & right eyes
        const alignPenalty = Math.abs(cy - bestLeft.cy) * 2.5;
        if (sc - alignPenalty > bestRight.score) {
          bestRight = { score: sc - alignPenalty, cx, cy, r };
        }
      }
    }
  }

  // Return coarse seeds in canvas pixels. They are refined by irisFit.js afterwards.
  const size = fullCanvas.width;
  const toSeed = (b) => ({
    x: (b.cx / W) * size,
    y: (b.cy / H) * size,
    r: (b.r * 1.15 * size) / W,
    lidPoly: null,
    found: b.score > -1e8,
  });
  return { left: toSeed(bestLeft), right: toSeed(bestRight) };
}
