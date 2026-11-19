// ============================================================================
// services/faceLandmarks.js
// MediaPipe FaceLandmarker (Tasks Vision) -> iris centre / radius + eyelid ring.
//
// Why this replaces the old `@mediapipe/face_mesh` script-tag setup:
//  * the legacy "solutions" package is deprecated/unmaintained
//  * the old code never awaited loading, so on the first photo `faceMeshRef`
//    was still null and MediaPipe was silently skipped (it was never retried)
//  * here the landmarker is a shared promise that detection always awaits.
//
// Offline / hospital-network note: for events with unreliable internet, copy
// the .task model and the /wasm folder into /public and point MODEL_URL and
// WASM_URL at them (e.g. '/mediapipe/face_landmarker.task', '/mediapipe/wasm').
// ============================================================================
import {
  LEFT_IRIS_CENTER,
  LEFT_IRIS_EDGES,
  RIGHT_IRIS_CENTER,
  RIGHT_IRIS_EDGES,
  LEFT_EYE_CONTOUR,
  RIGHT_EYE_CONTOUR,
} from './mediapipeDetector';
import { smoothClosedPolygon } from './irisFit';

const TASKS_VERSION = '0.10.14';
// Loaded from the CDN as a native ES module, so no npm install/bundler config is needed
// (same approach as the original CDN script tag). Self-host these three URLs for offline use.
const BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarkerPromise = null;

export function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ BUNDLE_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'IMAGE',
          numFaces: 2,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          outputFaceBlendshapes: false,
        });
      try {
        return await make('GPU');
      } catch (e) {
        return await make('CPU'); // GPU delegate is unavailable on some browsers/devices
      }
    })().catch((err) => {
      landmarkerPromise = null; // allow a retry on the next photo
      throw err;
    });
  }
  return landmarkerPromise;
}

/**
 * @param source   HTMLImageElement | HTMLCanvasElement of the FULL uploaded photo
 * @param crop     {sx, sy, size}  the square crop (in source pixels) that becomes the 1000px canvas
 * @param canvasSize  target canvas size (1000)
 * @returns {left,right} seeds {x,y,r,lidPoly} in canvas px, or null if no face found
 */
export async function detectEyeSeeds(source, crop, canvasSize = 1000) {
  const landmarker = await getFaceLandmarker();
  const result = landmarker.detect(source);
  const faces = result?.faceLandmarks;
  if (!faces || faces.length === 0) return null;

  // pick the largest face
  const area = (lm) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of lm) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return (x1 - x0) * (y1 - y0);
  };
  const lm = faces.reduce((best, f) => (area(f) > area(best) ? f : best), faces[0]);
  if (lm.length < 478) return null; // iris landmarks missing

  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  const k = canvasSize / crop.size;
  const toCanvas = (p) => ({ x: (p.x * srcW - crop.sx) * k, y: (p.y * srcH - crop.sy) * k });

  const buildEye = (centerIdx, edgeIdx, contourIdx) => {
    const c = toCanvas(lm[centerIdx]);
    const edges = edgeIdx.map((i) => toCanvas(lm[i]));
    const r = edges.reduce((acc, e) => acc + Math.hypot(e.x - c.x, e.y - c.y), 0) / edges.length;
    const ring = contourIdx.map((i) => toCanvas(lm[i]));
    return { x: c.x, y: c.y, r, lidPoly: smoothClosedPolygon(ring, 2), found: true };
  };

  return {
    left: buildEye(LEFT_IRIS_CENTER, LEFT_IRIS_EDGES, LEFT_EYE_CONTOUR),
    right: buildEye(RIGHT_IRIS_CENTER, RIGHT_IRIS_EDGES, RIGHT_EYE_CONTOUR),
  };
}
