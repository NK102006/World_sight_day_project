// ============================================================================
// services/photoCheck.js
// Checks a new photo (upload or camera) before it is used in the studio:
//   - the photo is big enough
//   - exactly one face, fully inside the photo, large enough
//   - the face looks at the camera (not turned or tilted)
//   - both eyes are open and big enough to recolour
//   - the face is not too dark or too bright, and is sharp (not blurry)
// Uses the same MediaPipe FaceLandmarker as the eye detection (services/faceLandmarks.js).
//
// checkPhoto(src) resolves to
//   { ok: true }
//   { ok: false, problems: [{ id, message }] }                 the photo should not be used
//   { ok: false, unavailable: true, problems: [...] }          the checker could not run (e.g. offline)
// ============================================================================
import { getFaceLandmarker } from './faceLandmarks';

// Thresholds. Measured on the full-resolution photo unless noted.
export const LIMITS = {
  minSide: 400, // px, shortest side of the photo
  minFaceWidthPx: 100, // px, width of the face
  minFaceFraction: 0.12, // face width / photo width (or height, whichever is smaller)
  minIrisPx: 10, // px, iris diameter
  minEyeOpen: 0.17, // eye aspect ratio (lid gap / eye width); open eyes are about 0.25 to 0.35
  maxYaw: 0.32, // 0 = facing the camera, 1 = full profile
  maxRollDeg: 18, // head tilt
  secondFaceRatio: 0.35, // a second face this big (relative to the main one) counts as another person
  minBrightness: 60, // mean face brightness, 0 to 255
  maxBrightness: 210,
  maxClipped: 0.22, // share of blown-out (pure white) face pixels
  minSharpness: 5, // edge strength / contrast around the eyes (sharp photos score about 40+, blurred ones below 1)
};

// Landmark indices (MediaPipe face mesh, 478 points)
const L = {
  leftOuter: 33, leftInner: 133, rightInner: 362, rightOuter: 263, noseTip: 1,
  leftLids: [[159, 145], [160, 144], [158, 153]],
  rightLids: [[386, 374], [385, 380], [387, 373]],
  leftIris: [469, 471], // opposite edges (horizontal)
  rightIris: [474, 476],
  leftEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  rightEye: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load'));
    img.src = src;
  });

const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};

/** Grey pixels of a region of the image, scaled to `width` px wide. */
function greyRegion(img, box, width) {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round((box.h / box.w) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, box.x0, box.y0, box.w, box.h, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const grey = new Float32Array(w * h);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { grey, w, h };
}

/**
 * Sharpness: variance of the Laplacian (edge strength) divided by the variance of the
 * brightness (contrast), so dark or low-contrast photos are not mistaken for blurry ones.
 * Low values mean a blurry picture.
 */
function sharpness({ grey, w, h }) {
  let gSum = 0, gSq = 0;
  for (const v of grey) { gSum += v; gSq += v * v; }
  const gMean = gSum / grey.length;
  const contrast = Math.max(25, gSq / grey.length - gMean * gMean);
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return ((sumSq / n - mean * mean) / contrast) * 100;
}

const clampBox = (b, W, H) => {
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0);
  const x1 = Math.min(W, b.x1), y1 = Math.min(H, b.y1);
  return { x0, y0, x1, y1, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
};

export async function checkPhoto(src) {
  let img;
  try {
    img = await loadImage(src);
  } catch {
    return { ok: false, problems: [{ id: 'load', message: 'This file could not be opened as a photo. Try a JPG or PNG.' }] };
  }
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const problems = [];
  const add = (id, message) => problems.push({ id, message });

  if (Math.min(W, H) < LIMITS.minSide) {
    add('resolution', `The photo is too small (${W} × ${H} px). Use a photo at least ${LIMITS.minSide} px on each side.`);
  }

  // Detect on a copy at most 1280 px wide/high (fast, and what the eye detection uses too)
  let faces;
  try {
    const landmarker = await getFaceLandmarker();
    const s = Math.min(1, 1280 / Math.max(W, H));
    const det = document.createElement('canvas');
    det.width = Math.round(W * s);
    det.height = Math.round(H * s);
    det.getContext('2d').drawImage(img, 0, 0, det.width, det.height);
    faces = landmarker.detect(det)?.faceLandmarks || [];
  } catch {
    return {
      ok: false,
      unavailable: true,
      problems: [{ id: 'checker', message: 'The photo could not be checked because the face checker did not load. It needs an internet connection.' }],
    };
  }

  if (!faces.length) {
    add('noface', 'No face was found. Use a clear, front-facing photo of the doctor.');
    return { ok: false, problems };
  }

  // Landmarks in photo pixels; the largest face is the doctor
  const toPx = (lm) => lm.map((p) => ({ x: p.x * W, y: p.y * H }));
  const all = faces.map((f) => ({ raw: f, px: toPx(f), box: bbox(toPx(f)) }));
  all.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const face = all[0];
  if (all.length > 1 && all[1].box.w * all[1].box.h > LIMITS.secondFaceRatio * face.box.w * face.box.h) {
    add('faces', 'More than one face is in the photo. Use a photo of the doctor alone.');
  }
  if (face.raw.length < 478) {
    add('eyes', 'The eyes could not be found. Use a photo where both eyes are clearly visible.');
    return { ok: false, problems };
  }

  const P = face.px;
  const box = face.box;
  const dist = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y);

  // Face fully inside the photo
  const margin = 0.01;
  if (face.raw.some((p) => p.x < margin || p.x > 1 - margin || p.y < margin || p.y > 1 - margin)) {
    add('cutoff', 'The face is cut off at the edge of the photo. Make sure the whole face is in the picture.');
  }

  // Face size
  if (box.w < LIMITS.minFaceWidthPx || box.w / Math.min(W, H) < LIMITS.minFaceFraction) {
    add('small', 'The face is too small or too far away. Move closer, or use a photo where the face fills more of the picture.');
  }

  // Looking at the camera: where the nose sits between the outer eye corners, measured along
  // the line between the eyes (so a tilted head is not mistaken for a turned one)
  const ex = P[L.rightOuter].x - P[L.leftOuter].x, ey = P[L.rightOuter].y - P[L.leftOuter].y;
  const len = Math.max(1, Math.hypot(ex, ey));
  const along = (p) => ((p.x - P[L.leftOuter].x) * ex + (p.y - P[L.leftOuter].y) * ey) / len;
  const dl = Math.abs(along(P[L.noseTip]));
  const dr = Math.abs(len - along(P[L.noseTip]));
  const yaw = Math.abs(dl - dr) / Math.max(1, dl + dr);
  if (yaw > LIMITS.maxYaw) add('turned', 'The face is turned to the side. The doctor should look straight at the camera.');
  const roll = (Math.atan2(P[L.rightOuter].y - P[L.leftOuter].y, P[L.rightOuter].x - P[L.leftOuter].x) * 180) / Math.PI;
  if (Math.abs(roll) > LIMITS.maxRollDeg) add('tilted', 'The head is tilted. Keep the head straight.');

  // Eyes open
  const openness = (lids, a, b) => lids.reduce((s, [u, d]) => s + dist(u, d), 0) / lids.length / Math.max(1, dist(a, b));
  const leftOpen = openness(L.leftLids, L.leftOuter, L.leftInner);
  const rightOpen = openness(L.rightLids, L.rightInner, L.rightOuter);
  if (leftOpen < LIMITS.minEyeOpen && rightOpen < LIMITS.minEyeOpen) {
    add('closed', 'The eyes look closed or half closed. Both eyes must be fully open.');
  } else if (leftOpen < LIMITS.minEyeOpen || rightOpen < LIMITS.minEyeOpen) {
    add('closed', 'One eye looks closed or half closed. Both eyes must be fully open.');
  }

  // Eyes big enough to recolour
  const iris = Math.min(dist(...L.leftIris), dist(...L.rightIris));
  if (iris < LIMITS.minIrisPx) add('eyesmall', 'The eyes are too small to see clearly. Use a closer or higher-quality photo.');

  // Light: brightness of the face (the middle of the face box, to avoid hair and background)
  const inner = clampBox(
    { x0: box.x0 + box.w * 0.2, x1: box.x1 - box.w * 0.2, y0: box.y0 + box.h * 0.2, y1: box.y1 - box.h * 0.15 },
    W,
    H
  );
  const faceGrey = greyRegion(img, inner, 160);
  let total = 0, clipped = 0;
  for (const v of faceGrey.grey) {
    total += v;
    if (v > 250) clipped++;
  }
  const brightness = total / faceGrey.grey.length;
  if (brightness < LIMITS.minBrightness) add('dark', 'The face is too dark. Take the photo in better light, facing a window or lamp.');
  else if (brightness > LIMITS.maxBrightness || clipped / faceGrey.grey.length > LIMITS.maxClipped) {
    add('bright', 'The face is too bright or washed out. Avoid strong flash or direct sunlight.');
  }

  // Sharpness: the area around both eyes, scaled to a fixed width so photos of any size compare fairly
  const eyes = bbox([...L.leftEye, ...L.rightEye].map((i) => P[i]));
  const eyeBox = clampBox({ x0: eyes.x0 - eyes.w * 0.15, x1: eyes.x1 + eyes.w * 0.15, y0: eyes.y0 - eyes.h * 1.2, y1: eyes.y1 + eyes.h * 1.2 }, W, H);
  const sharp = sharpness(greyRegion(img, eyeBox, Math.min(320, eyeBox.w))); // never enlarged
  if (sharp < LIMITS.minSharpness) add('blurry', 'The photo is blurry. Hold the camera still and make sure the face is in focus.');

  return problems.length ? { ok: false, problems, metrics: { yaw, roll, leftOpen, rightOpen, iris, brightness, sharp, faceW: box.w, faceFrac: box.w / Math.min(W, H) } } : { ok: true, metrics: { yaw, roll, leftOpen, rightOpen, iris, brightness, sharp, faceW: box.w, faceFrac: box.w / Math.min(W, H) } };
}
