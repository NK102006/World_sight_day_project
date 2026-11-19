import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { animate } from 'framer-motion';
import { Eye, EyeOff, RefreshCw, CheckCircle2, AlertTriangle, Crosshair, ZoomIn, ZoomOut, Layers, RotateCcw } from 'lucide-react';
import { detectIrisesFullImageJS } from '../services/mediapipeDetector';
import { detectEyeSeeds } from '../services/faceLandmarks';
import { fitIrisCircle, almondPolygon, signedDistToPoly } from '../services/irisFit';
import { renderAdjustedSquare, isDefaultAdjust } from '../services/imageAdjust';
import { FRAME_PALETTE, DEFAULT_FRAME_STYLE, FRAME_DESIGNS } from './frameStyles';
import { drawFrameDesign } from './frameDesigns';
import { SAMPLE_PHOTO, FRAME_PNG } from '../assets';

// Measured iris circles (1000px canvas) for the bundled sample portrait. Only used if
// MediaPipe cannot run, so the demo image still looks right offline.
const SAMPLE_PORTRAIT_SEEDS = {
  left: { x: 433, y: 312.5, r: 11.8, lidPoly: null, found: true },
  right: { x: 567.3, y: 312.5, r: 12.2, lidPoly: null, found: true },
};

const APPLY_MS = 1500; // length of the "Applying shade / frame" loading animation

const hexToRgb = (hex) => {
  const h = (hex || '#2563EB').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ============================================================================
// COMPONENT 5: CanvasPreview.js
// Iris detection pipeline (most accurate first):
//  1. MediaPipe FaceLandmarker on the FULL photo -> iris centre/radius + eyelid ring
//  2. irisFit.js sub-pixel limbus fit (circle) constrained by those landmarks
//  3. Fallback heuristic (dark-iris assumption) -> flagged low-confidence
//  4. Click/drag an eye to place it by hand; it re-snaps to the limbus on release
// Rendering uses visible iris = circle ∩ eyelid polygon (not a squashed ellipse).
// ============================================================================
export default function CanvasPreview({
  canvasRef,
  uploadedImage,
  adjust,
  frameStyle = DEFAULT_FRAME_STYLE,
  activeShade,
  shadeIntensity,
  doctorName,
  clinicSubtitle,
  isProcessing,
  setIsProcessing,
}) {
  const loadedImageRef = useRef(null);
  const loadedFrameRef = useRef(null);
  const leftLoupeCanvasRef = useRef(null);
  const rightLoupeCanvasRef = useRef(null);

  const [irisData, setIrisData] = useState(() => {
    const mk = (seed) => ({
      x: seed.x / 1000, y: seed.y / 1000, r: seed.r / 1000, rx: seed.r / 1000, ry: seed.r / 1000,
      eyelidPoly: almondPolygon(seed.x, seed.y, seed.r).map((p) => ({ x: p.x / 1000, y: p.y / 1000 })),
      lidFromLandmarks: false, confidence: 0.5,
    });
    return { left: mk(SAMPLE_PORTRAIT_SEEDS.left), right: mk(SAMPLE_PORTRAIT_SEEDS.right) };
  });
  const [imageVersion, setImageVersion] = useState(0);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [splitMode, setSplitMode] = useState(false);
  const [split, setSplit] = useState(50);
  const splitRef = useRef(null);
  const draggingSplit = useRef(false);

  // Before/after divider: track the pointer on the window so a fast drag never loses it
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingSplit.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
      setSplit(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    };
    const onUp = () => { draggingSplit.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);
  const [draggingEye, setDraggingEye] = useState(null); // 'left' | 'right' | null
  const detectedEyes = useRef(null); // where detection put each eye, so "Reset" can bring it back
  const [showOriginal, setShowOriginal] = useState(false);
  const [showMeshMarkers, setShowMeshMarkers] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState('Ready');

  // ---------------------------------------------------------------------------
  // "Applying" transition (1.5s) whenever the eye shade or the frame changes.
  // It shows the change happening instead of hiding it:
  //  * Before the canvas redraws, the OLD portrait is copied into snapshotRef
  //    (useLayoutEffect runs before the drawing effect, renderComposite).
  //  * Shade: holes open in that snapshot at each iris and grow from the pupil
  //    outward, so the new colour blooms through, inside turning gold lens rings.
  //  * Frame: the snapshot is wiped away left to right behind a glowing gold
  //    line, uncovering the new frame.
  // Keep APPLY_MS in step with the 1.5s CSS durations of .fx-apply-* in index.css.
  // ---------------------------------------------------------------------------
  const snapshotRef = useRef(null);
  const ringRefs = useRef([]);
  const wipeLineRef = useRef(null);
  const [applying, setApplying] = useState(null); // { kind, key, label, eyes } | null
  const lastChoice = useRef({ shade: activeShade?.id, frame: frameStyle });

  useLayoutEffect(() => {
    const prev = lastChoice.current;
    lastChoice.current = { shade: activeShade?.id, frame: frameStyle };
    let kind = null;
    if (prev.shade !== activeShade?.id) kind = 'shade';
    else if (prev.frame !== frameStyle) kind = 'frame';
    if (!kind) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const src = canvasRef.current;
    const snap = snapshotRef.current;
    if (!src || !snap || !src.width) return undefined;
    snap.width = src.width;
    snap.height = src.height;
    snap.getContext('2d').drawImage(src, 0, 0); // the old look, still on screen
    Object.assign(snap.style, { maskImage: '', webkitMaskImage: '', clipPath: '', opacity: '1' });

    const frameLabel = FRAME_DESIGNS.find((d) => d.key === frameStyle)?.label;
    setApplying({
      kind,
      key: Date.now(),
      label: kind === 'shade' ? `Applying ${activeShade?.name || 'shade'}…` : `Applying ${frameLabel || 'new'} frame…`,
      eyes: [irisData.left, irisData.right],
    });
    const timer = setTimeout(() => setApplying(null), APPLY_MS);
    return () => clearTimeout(timer);
    // irisData is read at the moment of the change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShade?.id, frameStyle]);

  // Drive the transition frame by frame (transform / opacity / mask / clip only)
  useEffect(() => {
    const snap = snapshotRef.current;
    if (!applying || !snap) return undefined;
    const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const easeInOut = (x) => 0.5 - Math.cos(Math.PI * x) / 2;

    const controls = animate(0, 1, {
      duration: APPLY_MS / 1000,
      ease: 'linear',
      onUpdate: (t) => {
        const fadeOut = 1 - seg(t, 0.84, 1); // last ~0.25s: everything settles away
        snap.style.opacity = String(fadeOut);

        if (applying.kind === 'shade') {
          // Holes grow from the pupil to just past the iris edge between ~0.15s and 1.3s
          // (ease-in-out, so the colour visibly spreads for about a second)
          const width = snap.offsetWidth; // layout size: the mask is in the picture's own (unzoomed) pixels
          const grow = easeInOut(seg(t, 0.1, 0.86));
          const holes = applying.eyes
            .map((e) => {
              const r = e.r * width;
              const hole = r * 1.15 * grow;
              const feather = Math.max(1, r * 0.22);
              return `radial-gradient(circle at ${(e.x * 100).toFixed(3)}% ${(e.y * 100).toFixed(3)}%, transparent ${hole.toFixed(2)}px, #000 ${(hole + feather).toFixed(2)}px)`;
            })
            .join(', ');
          snap.style.webkitMaskImage = holes;
          snap.style.maskImage = holes;

          const ringIn = easeOut(seg(t, 0, 0.15));
          ringRefs.current.forEach((ring) => {
            if (!ring) return;
            ring.style.opacity = String(ringIn * fadeOut);
            ring.style.transform = `translate(-50%, -50%) rotate(${(t * 220).toFixed(1)}deg) scale(${(0.7 + 0.3 * ringIn).toFixed(3)})`;
          });
        } else {
          // Wipe the old frame away left -> right between ~0.1s and 1.2s
          const p = easeOut(seg(t, 0.08, 0.8)) * 100;
          snap.style.clipPath = `inset(0 0 0 ${p.toFixed(2)}%)`;
          const line = wipeLineRef.current;
          if (line) {
            line.style.left = `${p.toFixed(2)}%`;
            line.style.opacity = String(seg(t, 0, 0.08) * (1 - seg(t, 0.8, 0.9)));
          }
        }
      },
    });
    return () => controls.stop();
  }, [applying]);

  // ---------------------------------------------------------------------------
  // "Zoom to eyes": the picture zooms inside the frame onto the face so the eye
  // shade is easy to see. Zoom is 1.6x-3x (3x is about as far as the 1000px
  // picture stays sharp), with the eyes centred a little above the middle.
  // The target is fixed when zoom is switched on (so dragging an eye doesn't
  // make the view chase it) and refreshed after a new photo is analysed.
  // ---------------------------------------------------------------------------
  const FULL_VIEW = { s: 1, tx: 0, ty: 0 };
  const [zoomed, setZoomed] = useState(false);
  const [zoomView, setZoomView] = useState(FULL_VIEW);
  const eyesView = () => {
    const { left: L, right: R } = irisData;
    const midX = (L.x + R.x) / 2;
    const midY = (L.y + R.y) / 2;
    const gap = Math.max(0.05, Math.abs(R.x - L.x));
    const s = Math.min(3, Math.max(1.6, 0.55 / gap));
    const keepInside = (t) => Math.min(0, Math.max(100 - s * 100, t)); // never show past the picture edge
    return { s, tx: keepInside(50 - s * midX * 100), ty: keepInside(45 - s * midY * 100) };
  };
  const toggleZoom = () => {
    const next = !zoomed;
    setZoomed(next);
    setZoomView(next ? eyesView() : FULL_VIEW);
  };
  useEffect(() => {
    if (zoomed && !isProcessing) setZoomView(eyesView());
    // re-aim only when a detection run finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing]);

  // Before/after divider is in frame coordinates; convert it to picture coordinates while zoomed
  const splitClipRight = Math.min(
    100,
    Math.max(0, 100 - ((split - zoomView.tx) / zoomView.s))
  );

  // Seed {x,y,r,lidPoly} (canvas px) -> refined, normalised eye record.
  const finalizeEye = (imgData, seed, size) => {
    const fit = fitIrisCircle(imgData, seed, { lidPoly: seed.lidPoly });
    const poly = seed.lidPoly || almondPolygon(fit.x, fit.y, fit.r);
    const r = fit.r / size;
    return {
      x: fit.x / size,
      y: fit.y / size,
      r,
      rx: r,
      ry: r,
      eyelidPoly: poly.map((p) => ({ x: p.x / size, y: p.y / size })),
      lidFromLandmarks: !!seed.lidPoly,
      confidence: seed.lidPoly ? Math.max(0.7, fit.confidence) : fit.confidence * 0.5,
    };
  };

  // Preload World Sight Day transparent frame PNG
  useEffect(() => {
    const frameImg = new Image();
    frameImg.onload = () => {
      loadedFrameRef.current = frameImg;
      setImageVersion((v) => v + 1);
    };
    frameImg.src = FRAME_PNG;
  }, []);

  // Detect irises whenever the photo or its adjustments change. Slider moves are debounced.
  useEffect(() => {
    if (!uploadedImage) return;
    let isCancelled = false;
    setIsProcessing(true);
    setDetectionStatus('Detecting face and iris...');

    const timer = setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        if (isCancelled) return;
        const size = 1000;
        const offCanvas = renderAdjustedSquare(img, adjust, size);
        loadedImageRef.current = offCanvas;
        setOriginalUrl(offCanvas.toDataURL('image/jpeg', 0.92));
        setImageVersion((v) => v + 1);

        // MediaPipe sees the adjusted photo at a higher resolution; coordinates are scaled to the 1000px canvas.
        const detectSize = 1280;
        let seeds = null;
        try {
          const detectCanvas = renderAdjustedSquare(img, adjust, detectSize);
          seeds = await detectEyeSeeds(detectCanvas, { sx: 0, sy: 0, size: detectSize }, size);
        } catch (err) {
          seeds = null; // WASM blocked / offline: fall through to the fallbacks
        }
        if (isCancelled) return;

        let status = 'Live Preview';
        let warn = false;
        if (!seeds) {
          if (uploadedImage === SAMPLE_PHOTO && isDefaultAdjust(adjust)) {
            seeds = SAMPLE_PORTRAIT_SEEDS;
            status = 'Sample portrait (calibrated). MediaPipe unavailable.';
          } else {
            seeds = detectIrisesFullImageJS(offCanvas);
            status = 'Approximate detection (MediaPipe unavailable). Click each eye to place it.';
            warn = true;
            if (!seeds.left.found || !seeds.right.found) status = 'No eyes found. Click each eye to place it.';
          }
        }

        const imgData = offCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size);
        const left = finalizeEye(imgData, seeds.left, size);
        const right = finalizeEye(imgData, seeds.right, size);
        if (isCancelled) return;
        setIrisData({ left, right });
        detectedEyes.current = { left, right };
        setDetectionStatus(status);
        setLowConfidence(warn);
        setIsProcessing(false);
      };
      img.onerror = () => {
        if (!isCancelled) setIsProcessing(false);
      };
      img.src = uploadedImage;
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [uploadedImage, adjust, setIsProcessing]);

  // Iris shade renderer. Visible iris = circle ∩ eyelid polygon, feathered at both edges.
  const drawIrisShadeLayer = (ctx, iris, canvasSize, shade, intensity) => {
    if (!iris || !shade) return;

    const cx = iris.x * canvasSize;
    const cy = iris.y * canvasSize;
    const r = iris.r * canvasSize;

    const pad = 4;
    const x0 = Math.max(0, Math.floor(cx - r - pad));
    const y0 = Math.max(0, Math.floor(cy - r - pad));
    const x1 = Math.min(canvasSize - 1, Math.ceil(cx + r + pad));
    const y1 = Math.min(canvasSize - 1, Math.ceil(cy + r + pad));
    const boxW = x1 - x0 + 1;
    const boxH = y1 - y0 + 1;
    if (boxW <= 2 || boxH <= 2) return;

    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = boxW;
    patchCanvas.height = boxH;
    const pCtx = patchCanvas.getContext('2d', { willReadFrequently: true });
    pCtx.drawImage(ctx.canvas, x0, y0, boxW, boxH, 0, 0, boxW, boxH);
    const origData = pCtx.getImageData(0, 0, boxW, boxH);

    const localCx = cx - x0;
    const localCy = cy - y0;
    const [sr, sg, sb] = shade.rgb || hexToRgb(shade.hex);

    pCtx.save();
    pCtx.globalCompositeOperation = 'color';
    const grad = pCtx.createRadialGradient(localCx, localCy, r * 0.25, localCx, localCy, r);
    grad.addColorStop(0, shade.highlightHex || shade.hex);
    grad.addColorStop(0.7, shade.hex);
    grad.addColorStop(1, shade.hex);
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, boxW, boxH);
    pCtx.globalCompositeOperation = 'soft-light';
    pCtx.globalAlpha = 0.72;
    pCtx.fillStyle = shade.highlightHex || shade.hex;
    pCtx.fillRect(0, 0, boxW, boxH);
    pCtx.restore();

    const tint = pCtx.getImageData(0, 0, boxW, boxH).data;
    const outData = pCtx.createImageData(boxW, boxH);
    const src = origData.data;
    const dst = outData.data;

    const polyPx =
      iris.eyelidPoly && iris.eyelidPoly.length >= 6
        ? iris.eyelidPoly.map((p) => ({ x: p.x * canvasSize - x0, y: p.y * canvasSize - y0 }))
        : null;

    const smoothstep = (e0, e1, x) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    // Signed distance to the eyelid edge for every pixel (positive = inside the eye opening)
    const lidDist = new Float32Array(boxW * boxH);
    for (let py = 0; py < boxH; py++) {
      for (let px = 0; px < boxW; px++) {
        lidDist[py * boxW + px] = polyPx ? signedDistToPoly(px, py, polyPx) : 99;
      }
    }

    // Median luminance of the real iris (inside lids, away from catchlights) adapts the mapping to any eye colour
    const sampleLums = [];
    for (let py = 0; py < boxH; py++) {
      for (let px = 0; px < boxW; px++) {
        const d = Math.hypot(px - localCx, py - localCy);
        if (d > 0.3 * r && d < 0.85 * r && lidDist[py * boxW + px] > 1.5) {
          const i = (py * boxW + px) * 4;
          const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
          if (lum < 185) sampleLums.push(lum);
        }
      }
    }
    sampleLums.sort((p, q) => p - q);
    const medianIrisLum = sampleLums.length ? sampleLums[Math.floor(sampleLums.length * 0.55)] : 58;
    const scleraCut = Math.min(190, Math.max(110, medianIrisLum + 60)); // safety net only

    for (let py = 0; py < boxH; py++) {
      for (let px = 0; px < boxW; px++) {
        const idx = (py * boxW + px) * 4;
        const R = src[idx];
        const G = src[idx + 1];
        const B = src[idx + 2];
        const lum = 0.299 * R + 0.587 * G + 0.114 * B;
        const d = Math.hypot(px - localCx, py - localCy);

        const wCircle = 1 - smoothstep(r - 1.6, r - 0.2, d);
        const wLid = smoothstep(0.2, 1.8, lidDist[py * boxW + px]);
        const wGeo = wCircle * wLid;
        if (wGeo <= 0.001) {
          dst[idx] = R; dst[idx + 1] = G; dst[idx + 2] = B; dst[idx + 3] = 255;
          continue;
        }

        const wSclera = 1 - smoothstep(scleraCut - 12, scleraCut + 22, lum);
        const wCatch = 1 - smoothstep(175, 225, lum); // keep specular catchlights
        // Pupil: a smooth disc at the iris centre keeps the ORIGINAL dark pixels (no tint, no painted dot).
        // (Pixel-threshold protection was tried first; it also protected lash shadow and looked ragged.)
        const wPupil = smoothstep(0.3 * r, 0.46 * r, d);

        const maskAlpha = Math.max(0, Math.min(1, intensity * wGeo * wSclera * wCatch * wPupil));

        const fiberScale = Math.min(1.35, Math.max(0.45, (lum + 18) / (medianIrisLum + 22)));
        const tR = tint[idx] * 0.55 + Math.min(255, sr * fiberScale) * 0.45;
        const tG = tint[idx + 1] * 0.55 + Math.min(255, sg * fiberScale) * 0.45;
        const tB = tint[idx + 2] * 0.55 + Math.min(255, sb * fiberScale) * 0.45;
        const limbal = 1 - 0.25 * smoothstep(0.78 * r, r, d); // subtle limbal ring

        dst[idx] = Math.round(R * (1 - maskAlpha) + tR * limbal * maskAlpha);
        dst[idx + 1] = Math.round(G * (1 - maskAlpha) + tG * limbal * maskAlpha);
        dst[idx + 2] = Math.round(B * (1 - maskAlpha) + tB * limbal * maskAlpha);
        dst[idx + 3] = 255;
      }
    }

    pCtx.putImageData(outData, 0, 0);
    ctx.drawImage(patchCanvas, x0, y0);

    if (showMeshMarkers) {
      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      if (polyPx) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        polyPx.forEach((p, i) => {
          const X = p.x + x0;
          const Y = p.y + y0;
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = '#F43F5E';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  // World Sight Day frame: gradient border, eye badge, caption panel. Drawn in code so text stays crisp at any size.
  const drawWorldSightDayFrame = (ctx, size, docName, subtitle, t = FRAME_PALETTE) => {
    ctx.save();
    const inset = 20;
    const radius = 30;
    const panelH = 230;

    // Repeating almond-eye motif, drawn only inside the clip set up by the caller
    const eyeMotif = (spacing, color, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      const eye = (x, y) => {
        const w = spacing * 0.42;
        const h = w * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.quadraticCurveTo(x, y - h, x + w / 2, y);
        ctx.quadraticCurveTo(x, y + h, x - w / 2, y);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, h * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      };
      for (let row = 0, gy = -spacing; gy <= size + spacing; gy += spacing * 0.8, row++) {
        const offset = row % 2 ? spacing / 2 : 0;
        for (let gx = -spacing + offset; gx <= size + spacing; gx += spacing) eye(gx, gy);
      }
      ctx.restore();
    };

    // 1. Bottom caption panel, fading in from the photo
    const panelGrad = ctx.createLinearGradient(0, size - panelH, 0, size);
    panelGrad.addColorStop(0, t.panel[0]);
    panelGrad.addColorStop(0.42, t.panel[1]);
    panelGrad.addColorStop(1, t.panel[2]);
    ctx.fillStyle = panelGrad;
    ctx.fillRect(0, size - panelH, size, panelH);

    // 2. Gradient border band with rounded inner corners
    const bandGrad = ctx.createLinearGradient(0, 0, size, size);
    bandGrad.addColorStop(0, t.bandStops[0]);
    bandGrad.addColorStop(0.5, t.bandStops[1]);
    bandGrad.addColorStop(1, t.bandStops[2]);
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius);
    ctx.fillStyle = bandGrad;
    ctx.fill('evenodd');

    // Eye motif across the border band (clipped to the band only)

    // Thin light lines on the inner and outer edges of the band
    ctx.beginPath();
    ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius);
    ctx.strokeStyle = t.innerLine;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(6, 6, size - 12, size - 12, radius - 6);
    ctx.strokeStyle = t.outerLine;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Diamond ornaments in the four corners of the band
    const diamond = (x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = t.accent;
      ctx.fill();
    };
    const c = inset / 2;
    [[c, c], [size - c, c], [c, size - c], [size - c, size - c]].forEach(([x, y]) => diamond(x, y, 4.5));

    // 3. Top badge with a small eye glyph
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.letterSpacing = '3px';
    const badgeText = 'WORLD SIGHT DAY';
    const textW = ctx.measureText(badgeText).width;
    ctx.letterSpacing = '0px';
    const glyphW = 30;
    const gap = 12;
    const badgeW = glyphW + gap + textW + 44;
    const badgeH = 44;
    const badgeX = (size - badgeW) / 2;
    const badgeY = inset + 14;
    const badgeGrad = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
    badgeGrad.addColorStop(0, t.badgeStops[0]);
    badgeGrad.addColorStop(1, t.badgeStops[1]);
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = t.badgeStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const cy = badgeY + badgeH / 2;
    const gx = badgeX + 22 + glyphW / 2;
    ctx.beginPath();
    ctx.moveTo(gx - 15, cy);
    ctx.quadraticCurveTo(gx, cy - 11, gx + 15, cy);
    ctx.quadraticCurveTo(gx, cy + 11, gx - 15, cy);
    ctx.fillStyle = t.eyeWhite;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = t.iris;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = t.pupil;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx + 2, cy - 2.5, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.fillStyle = t.badgeText;
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + 22 + glyphW + gap, cy + 1);
    ctx.letterSpacing = '0px';

    // 4. Doctor name, divider and caption
    const rawName = (docName || '').trim();
    const formattedDoctorName = rawName
      ? /^dr\.?\s/i.test(rawName)
        ? rawName
        : `Dr. ${rawName}`
      : "Dr. [Doctor's Name]";

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = t.name;
    ctx.font = '700 40px Georgia, "Times New Roman", serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText(formattedDoctorName, size / 2, size - 92);
    ctx.shadowBlur = 0;

    const divY = size - 124;
    const divGrad = ctx.createLinearGradient(size * 0.22, 0, size * 0.78, 0);
    divGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    divGrad.addColorStop(0.5, t.divider);
    divGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(size * 0.22, divY);
    ctx.lineTo(size * 0.78, divY);
    ctx.stroke();
    diamond(size / 2, divY, 4);

    // Small eyes on the divider, either side of the diamond
    const drawEye = (x, y, w) => {
      const h = w * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.quadraticCurveTo(x, y - h, x + w / 2, y);
      ctx.quadraticCurveTo(x, y + h, x - w / 2, y);
      ctx.closePath();
      ctx.fillStyle = t.eyeWhite;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, h * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = t.iris;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, h * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = t.pupil;
      ctx.fill();
    };
    drawEye(size / 2 - 200, divY, 30);
    drawEye(size / 2 + 200, divY, 30);

    ctx.fillStyle = t.caption;
    ctx.font = '500 17px Inter, system-ui, sans-serif';
    ctx.fillText(
      subtitle || '“See Yourself in a New Shade” • World Sight Day Initiative',
      size / 2,
      size - 50
    );

    ctx.restore();
  };

  // Update 4x Magnified Left & Right Eye Loupe Canvases from the rendered composite
  const updateEyeLoupes = useCallback(() => {
    const mainCanvas = canvasRef?.current;
    if (!mainCanvas) return;
    const size = mainCanvas.width;

    [
      { eye: irisData.left, ref: leftLoupeCanvasRef },
      { eye: irisData.right, ref: rightLoupeCanvasRef },
    ].forEach(({ eye, ref }) => {
      const lCanvas = ref.current;
      if (!lCanvas || !eye) return;
      lCanvas.width = 140;
      lCanvas.height = 90;
      const lCtx = lCanvas.getContext('2d');
      const boxW = Math.max(eye.r * size * 4.2, 56);
      const boxH = boxW * (90 / 140);
      const sx = Math.max(0, Math.min(size - boxW, eye.x * size - boxW / 2));
      const sy = Math.max(0, Math.min(size - boxH, eye.y * size - boxH / 2));
      lCtx.clearRect(0, 0, 140, 90);
      lCtx.drawImage(mainCanvas, sx, sy, boxW, boxH, 0, 0, 140, 90);
    });
  }, [canvasRef, irisData]);

  const renderComposite = useCallback(() => {
    const canvas = canvasRef?.current;
    const baseImageCanvas = loadedImageRef.current;
    if (!canvas || !baseImageCanvas) return;

    const size = 1000;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(baseImageCanvas, 0, 0, size, size);

    if (!showOriginal && activeShade) {
      drawIrisShadeLayer(ctx, irisData.left, size, activeShade, shadeIntensity);
      drawIrisShadeLayer(ctx, irisData.right, size, activeShade, shadeIntensity);
    }

    if (frameStyle && frameStyle !== 'classic') {
      drawFrameDesign(ctx, size, doctorName, clinicSubtitle, frameStyle, FRAME_PALETTE);
    } else {
      drawWorldSightDayFrame(ctx, size, doctorName, clinicSubtitle, FRAME_PALETTE);
    }
    updateEyeLoupes();
  }, [
    canvasRef,
    activeShade,
    shadeIntensity,
    doctorName,
    clinicSubtitle,
    irisData,
    showOriginal,
    showMeshMarkers,
    imageVersion,
    frameStyle,
    updateEyeLoupes,
  ]);

  useEffect(() => {
    renderComposite();
  }, [renderComposite]);

  // Direct on-canvas drag or click-to-place iris center (automatically moves pupil & snaps to edges on release)
  const getNormCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width)),
      y: Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height)),
    };
  };

  // The colour is only painted inside the eyelids, so an iris dragged outside them would vanish
  // (and could not be found to drag back). Keep the iris centre inside the eye opening.
  const keepInsideLids = (eye, pt) => {
    if (!eye.lidFromLandmarks || !eye.eyelidPoly?.length) return pt;
    const poly = eye.eyelidPoly;
    if (signedDistToPoly(pt.x, pt.y, poly) >= 0) return pt;
    // nearest point on the eyelid outline, then a little way in towards the middle of the eye
    let best = null;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const q = { x: a.x + t * dx, y: a.y + t * dy };
      const d = Math.hypot(pt.x - q.x, pt.y - q.y);
      if (!best || d < best.d) best = { ...q, d };
    }
    const cx = poly.reduce((sum, q) => sum + q.x, 0) / poly.length;
    const cy = poly.reduce((sum, q) => sum + q.y, 0) / poly.length;
    const len = Math.hypot(cx - best.x, cy - best.y) || 1;
    const step = Math.min(len, eye.r * 0.35);
    return { x: best.x + ((cx - best.x) / len) * step, y: best.y + ((cy - best.y) / len) * step };
  };

  // The whole iris circle stays within the eye: its centre inside the eyelids, and the circle
  // never past the inner or outer corner of the eye (r = the iris radius to allow for).
  const constrainToEye = (eye, pt, r = eye.r) => {
    if (!eye.lidFromLandmarks || !eye.eyelidPoly?.length) return pt;
    const xs = eye.eyelidPoly.map((q) => q.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const m = Math.min(r, ((maxX - minX) / 2) * 0.9); // a very small eye: keep it centred
    const clampX = (x) => Math.max(minX + m, Math.min(maxX - m, x));
    const inside = keepInsideLids({ ...eye, r }, { x: clampX(pt.x), y: pt.y });
    return keepInsideLids({ ...eye, r }, { x: clampX(inside.x), y: inside.y });
  };

  const moveEye = (key, rawPt) => {
    setIrisData((prev) => {
      const eye = prev[key];
      const pt = constrainToEye(eye, rawPt);
      return {
        ...prev,
        [key]: {
          ...eye,
          x: pt.x,
          y: pt.y,
          // eyelids don't move when the iris is nudged; only a synthetic (non-landmark) lid follows the iris
          eyelidPoly: eye.lidFromLandmarks
            ? eye.eyelidPoly
            : almondPolygon(pt.x * 1000, pt.y * 1000, eye.r * 1000).map((p) => ({ x: p.x / 1000, y: p.y / 1000 })),
        },
      };
    });
  };

  /**
   * Which eye a point is on ('left' | 'right'), or null. The eye area is the eye opening
   * (eyelid outline, with a hair of margin) plus the iris circle itself. Used for both
   * the "+" cursor and grabbing, so they always agree.
   */
  const eyeAt = (pt) => {
    const inEye = (k) => {
      const e = irisData[k];
      const inLids = e.eyelidPoly?.length && signedDistToPoly(pt.x, pt.y, e.eyelidPoly) > -e.r * 0.3;
      return inLids || Math.hypot(pt.x - e.x, pt.y - e.y) <= e.r * 1.1;
    };
    if (inEye('left')) return 'left';
    if (inEye('right')) return 'right';
    return null;
  };

  // The "+" cursor shows only over an eye (and while dragging one)
  const [overEye, setOverEye] = useState(false);

  const handlePointerDown = (e) => {
    if (!canvasRef.current) return;
    const pt = getNormCoords(e);
    const target = eyeAt(pt); // a click elsewhere does nothing
    if (!target) return;
    setDraggingEye(target);
    moveEye(target, pt);
  };

  const handlePointerMove = (e) => {
    if (!canvasRef.current) return;
    if (!draggingEye) {
      if (e.touches) return;
      const over = Boolean(eyeAt(getNormCoords(e)));
      if (over !== overEye) setOverEye(over);
      return;
    }
    moveEye(draggingEye, getNormCoords(e));
  };

  const handlePointerUp = () => {
    if (!draggingEye) return;
    const offCanvas = loadedImageRef.current;
    const key = draggingEye;
    setDraggingEye(null);
    if (!offCanvas) return;
    const size = offCanvas.width;
    const eye = irisData[key];
    const imgData = offCanvas.getContext('2d').getImageData(0, 0, size, size);
    const lid = eye.lidFromLandmarks ? eye.eyelidPoly.map((p) => ({ x: p.x * size, y: p.y * size })) : null;
    const fit = fitIrisCircle(imgData, { x: eye.x * size, y: eye.y * size, r: eye.r * size }, { lidPoly: lid });
    if (fit.usedPrior) return; // weak evidence: keep exactly where the user put it
    setIrisData((prev) => {
      const cur = prev[key];
      const snapped = constrainToEye(cur, { x: fit.x / size, y: fit.y / size }, fit.r / size);
      return {
        ...prev,
        [key]: {
          ...cur,
          x: snapped.x,
          y: snapped.y,
          r: fit.r / size,
          rx: fit.r / size,
          ry: fit.r / size,
          eyelidPoly: cur.lidFromLandmarks
            ? cur.eyelidPoly
            : almondPolygon(fit.x, fit.y, fit.r).map((p) => ({ x: p.x / size, y: p.y / size })),
        },
      };
    });
  };

  const scaleSingleEye = (eyeKey, factor) => {
    setIrisData((prev) => {
      const eye = prev[eyeKey];
      const r = Math.max(0.006, Math.min(0.05, eye.r * factor));
      const pt = constrainToEye(eye, { x: eye.x, y: eye.y }, r);
      return { ...prev, [eyeKey]: { ...eye, x: pt.x, y: pt.y, r, rx: r, ry: r } };
    });
  };

  const resetEye = (key) => {
    const found = detectedEyes.current?.[key];
    if (found) setIrisData((prev) => ({ ...prev, [key]: found }));
  };

  const loupes = [
    { key: 'left', label: 'Left eye', ref: leftLoupeCanvasRef, data: irisData.left },
    { key: 'right', label: 'Right eye', ref: rightLoupeCanvasRef, data: irisData.right },
  ];

  const toggleClass = (on) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      on ? 'bg-white text-ink' : 'text-white/75 ring-1 ring-inset ring-white/20 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div>
      {/* Status and view controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-2 pb-3 pt-1 sm:px-3">
        {isProcessing ? (
          <p className="flex items-center gap-2 text-[13px] font-medium text-white">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Finding the face and irises…
          </p>
        ) : (
          <p className={`flex min-w-0 items-center gap-2 text-[13px] font-medium ${lowConfidence ? 'text-gold' : 'text-white/80'}`}>
            {lowConfidence ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            )}
            <span className="truncate">{detectionStatus}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={splitMode}
            onClick={() => setSplitMode((v) => !v)}
            title="Drag a divider between the original and the new shade"
            className={toggleClass(splitMode)}
          >
            <Layers className="h-3.5 w-3.5" />
            Before / after
          </button>
          <button
            type="button"
            onClick={() => setShowMeshMarkers((prev) => !prev)}
            aria-pressed={showMeshMarkers}
            title="Show the detected iris outline"
            className={toggleClass(showMeshMarkers)}
          >
            <Crosshair className="h-3.5 w-3.5" />
            Outline
          </button>
          <button
            type="button"
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            onTouchStart={() => setShowOriginal(true)}
            onTouchEnd={() => setShowOriginal(false)}
            className={`${toggleClass(showOriginal)} select-none`}
          >
            {showOriginal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showOriginal ? 'Showing original' : 'Hold for original'}
          </button>
          <button
            type="button"
            onClick={toggleZoom}
            disabled={isProcessing}
            aria-pressed={zoomed}
            title={zoomed ? 'Show the whole portrait' : 'Zoom in on the face to see the eye shade clearly'}
            className={`${toggleClass(zoomed)} disabled:opacity-40`}
          >
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            {zoomed ? 'Show full' : 'Zoom to eyes'}
          </button>
        </div>
      </div>

      {/* Canvas, set in a mount: thin mint hairline, lighter teal mat, soft drop shadow */}
      <div className="mx-auto w-full max-w-[664px] rounded-[30px] border border-mint/25 bg-stage-raised p-[10px] shadow-[0_0_0_5px_rgba(211,236,228,0.05),0_24px_48px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.14)] lg:max-w-[min(664px,max(404px,calc(100vh_-_380px)))]">
      <div ref={splitRef} className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-black ring-1 ring-white/25">
        {/* Zoom layer: everything drawn in picture coordinates scales and moves together.
            translate % is relative to this layer (= the picture), origin is the top-left corner. */}
        <div
          className="absolute inset-0 origin-top-left transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
          style={{ transform: `translate(${zoomView.tx}%, ${zoomView.ty}%) scale(${zoomView.s})` }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={() => {
              setOverEye(false);
              handlePointerUp();
            }}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            className={`block h-full w-full touch-none object-contain ${draggingEye || overEye ? 'cursor-crosshair' : 'cursor-default'}`}
          />
          {splitMode && originalUrl && (
            <img
              src={originalUrl}
              alt="Original photo"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
              style={{ clipPath: `inset(0 ${splitClipRight}% 0 0)` }}
            />
          )}
          {/* Old-look snapshot used by the "applying" transition (hidden the rest of the time) */}
          <canvas
            ref={snapshotRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-contain ${
              applying && !isProcessing ? '' : 'hidden'
            }`}
            style={{ maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}
          />
          {!isProcessing && applying && (
            <div key={applying.key} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
              {applying.kind === 'shade' ? (
                // Gold "lens" rings that turn around each eye while the new colour blooms
                applying.eyes.map((e, i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      ringRefs.current[i] = el;
                    }}
                    className="absolute rounded-full border-2 border-dashed border-gold shadow-[0_0_14px_rgba(255,107,74,0.6)]"
                    style={{
                      left: `${e.x * 100}%`,
                      top: `${e.y * 100}%`,
                      width: `${e.r * 310}%`,
                      height: `${e.r * 310}%`,
                      borderWidth: `${2 / zoomView.s}px`,
                      opacity: 0,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ))
              ) : (
                // Glowing gold line that sweeps across, replacing the old frame
                <span
                  ref={wipeLineRef}
                  className="absolute inset-y-0 left-0 bg-gold shadow-[0_0_18px_4px_rgba(255,107,74,0.55)]"
                  style={{ width: `${3 / zoomView.s}px`, marginLeft: `${-1.5 / zoomView.s}px`, opacity: 0 }}
                />
              )}
            </div>
          )}
        </div>

        {/* Fixed layer: labels and controls that stay the same size while zoomed */}
        {splitMode && originalUrl && (
          <>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-stage/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              Original
            </span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[11px] font-semibold text-ink">
              New shade
            </span>
            <div className="absolute inset-y-0 z-10" style={{ left: `${split}%` }}>
              <div className="h-full w-0.5 -translate-x-1/2 bg-white" />
              <button
                type="button"
                aria-label="Drag to compare"
                onPointerDown={(e) => {
                  e.preventDefault();
                  draggingSplit.current = true;
                }}
                className="absolute left-0 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white text-ink shadow-xl"
              >
                <span className="text-sm font-bold">⇆</span>
              </button>
            </div>
          </>
        )}
        {!isProcessing && applying && (
          <div key={applying.key} role="status" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            <div className="absolute inset-x-0 bottom-5 flex justify-center">
              <div className="fx-apply-pill flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-lg">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {applying.label}
              </div>
            </div>
            <span aria-hidden="true" className="fx-apply-bar absolute inset-x-0 bottom-0 h-1 bg-gold" />
          </div>
        )}
        {isProcessing ? (
          <div className="fx-sweep pointer-events-none absolute inset-0 flex items-center justify-center bg-stage/55 backdrop-blur-[2px]">
            <div className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-lg">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Finding eyes…
            </div>
          </div>
        ) : (
          !splitMode && (
            <div className="hint-out pointer-events-none absolute bottom-[26%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-stage/75 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur">
              Drag an eye to move it
            </div>
          )
        )}
      </div>
      </div>

      {/* Loupes: close-up of each eye with size controls */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        {loupes.map(({ key, label, ref, data }) => (
          <div key={key} className="flex flex-col gap-2.5 rounded-[20px] bg-stage-raised p-2.5 sm:flex-row sm:items-center sm:gap-3">
            <canvas
              ref={ref}
              width={140}
              height={90}
              className="aspect-[14/9] w-full shrink-0 rounded-xl bg-black sm:w-[104px]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white">
                {label}
                <span className="ml-1.5 font-normal tabular-nums text-white/50">{(data.r * 1000).toFixed(1)} px</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scaleSingleEye(key, 0.93)}
                  aria-label={`Make ${label.toLowerCase()} iris smaller`}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ZoomOut className="h-3.5 w-3.5" /> <span className="hidden min-[420px]:inline">Smaller</span>
                </button>
                <button
                  type="button"
                  onClick={() => scaleSingleEye(key, 1.07)}
                  aria-label={`Make ${label.toLowerCase()} iris larger`}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ZoomIn className="h-3.5 w-3.5" /> <span className="hidden min-[420px]:inline">Larger</span>
                </button>
                <button
                  type="button"
                  onClick={() => resetEye(key)}
                  disabled={isProcessing || !detectedEyes.current}
                  title={`Put the ${label.toLowerCase()} back where it was found`}
                  aria-label={`Reset ${label.toLowerCase()}`}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden min-[420px]:inline">Reset</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
