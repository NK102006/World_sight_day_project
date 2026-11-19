// ============================================================================
// EyeStage.jsx
// The landing page's centrepiece (following the sketch):
//   * a drawn eye: almond shape with pointed corners, tear duct at the inner
//     corner, thick upper lid with a crease above it, curled lashes, soft lower lid
//   * a large round iris in the middle that touches the upper and lower lid and
//     moves around: it glances on its own and, on desktop, follows the pointer
//   * inside the iris, an upright frame-sample card: the studio's real frame
//     render (square, as exported) with the frame's name below it
//   * the studio's 8 eye shades arched above the eye; the highlighted one colours
//     the iris (the colour blends from one shade to the next)
//   * the studio's 5 frames curved below the eye; the highlighted one is shown in the iris
// It cycles on its own; hovering a shade or frame shows it; clicking anything opens
// the studio. With reduced motion everything stays still.
//
// Sizing: everything scales from one CSS variable, --h (the iris diameter), chosen
// so the whole eye (2.6 x --h wide) and the page fit on one screen.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { EYE_SHADES } from '../../components/ShadeSelector';
import { FRAME_DESIGNS } from '../../components/frameStyles';
import { EASE, motionAllowed } from '../lib/motion';
import { STUDIO_URL, asset } from '../lib/layout';

const SHADE_MS = 2400; // time each shade colours the iris
const FRAME_MS = 3000; // time each frame sample is shown
const GAZE_MS = 2200; // time between glances

// ---------------------------------------------------------------------------
// Eye drawing, in a 260 x 120 box (the eye element is 2.6 x 1.2 iris diameters).
// A real eye's shape: pointed corners, the inner corner (left) slightly lower and
// rounder with a small pink tear duct, the outer corner (right) slightly higher,
// a high-arched upper lid with a crease above it, a flatter lower lid.
// The iris (diameter 100, centred at 130, 60) touches the upper lid at y = 10 and
// the lower lid at y = 110, as in the sketch.
// ---------------------------------------------------------------------------
const UPPER = [
  [[4, 64], [36, 30], [84, 10], [130, 10]], // inner corner -> top of the iris
  [[130, 10], [178, 10], [226, 26], [256, 56]], // top of the iris -> outer corner
];
const LOWER = [
  [[256, 56], [228, 86], [180, 110], [130, 110]], // outer corner -> bottom of the iris
  [[130, 110], [80, 110], [34, 96], [4, 64]], // bottom of the iris -> inner corner
];
const seg = ([a, b, c, d]) => `C ${b[0]} ${b[1]}, ${c[0]} ${c[1]}, ${d[0]} ${d[1]}`;
const UPPER_D = `M4 64 ${UPPER.map(seg).join(' ')}`;
const LOWER_D = `M256 56 ${LOWER.map(seg).join(' ')}`;
const OPENING = `${UPPER_D} ${LOWER.map(seg).join(' ')} Z`;
const CREASE_D = 'M20 46 C 48 10, 96 -4, 132 -4 C 172 -4, 216 6, 244 34';
const MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 120' preserveAspectRatio='none'><path d='${OPENING}' fill='black'/></svg>`
)}") center / 100% 100% no-repeat`;

const round = (n) => Math.round(n * 100) / 100;
const cubic = ([a, b, c, d], t) =>
  [0, 1].map((k) => (1 - t) ** 3 * a[k] + 3 * (1 - t) ** 2 * t * b[k] + 3 * (1 - t) * t ** 2 * c[k] + t ** 3 * d[k]);
const tangent = ([a, b, c, d], t) =>
  [0, 1].map((k) => 3 * (1 - t) ** 2 * (b[k] - a[k]) + 6 * (1 - t) * t * (c[k] - b[k]) + 3 * t ** 2 * (d[k] - c[k]));

/** Curved lash from a lid point: out along the lid's normal, curling toward the outer corner. */
function lash(curve, t, len, curl, down = false) {
  const [x, y] = cubic(curve, t);
  const [dx, dy] = tangent(curve, t);
  const m = Math.hypot(dx, dy) || 1;
  let [nx, ny] = [dy / m, -dx / m]; // normal
  if ((down && ny < 0) || (!down && ny > 0)) [nx, ny] = [-nx, -ny];
  const cx = x + nx * len * 0.6;
  const cy = y + ny * len * 0.6;
  const tx = x + nx * len + curl * len;
  const ty = y + ny * len * 0.85;
  return `M${round(x)} ${round(y)} Q ${round(cx)} ${round(cy)} ${round(tx)} ${round(ty)}`;
}
// Upper lashes: short near the inner corner, longer and curling outward toward the outer corner
const UPPER_LASHES = [
  ...[0.38, 0.52, 0.66, 0.8, 0.93].map((t) => lash(UPPER[0], t, 6 + t * 3, -0.12)),
  ...[0.08, 0.22, 0.36, 0.5, 0.63, 0.75, 0.86, 0.95].map((t) => lash(UPPER[1], t, 9 + t * 7, 0.18 + t * 0.35)),
];
// A few short lower lashes toward the outer corner
const LOWER_LASHES = [0.15, 0.3, 0.45, 0.6].map((t) => lash(LOWER[0], t, 3.5 + (1 - t) * 1.5, 0.15, true));
// Iris fibres (in a 100 x 100 box)
const FIBRES = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const r0 = i % 2 ? 22 : 26;
  const r1 = i % 3 ? 45 : 41;
  return { x1: round(50 + Math.cos(a) * r0), y1: round(50 + Math.sin(a) * r0), x2: round(50 + Math.cos(a) * r1), y2: round(50 + Math.sin(a) * r1) };
});
/** Mix a hex colour toward black (f = 1 keeps it, 0 gives black). */
const darken = (hex, f) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

/** Small iris swatch for the shade arc. */
function IrisSwatch({ shade }) {
  return (
    <svg viewBox="0 0 40 40" className="block h-full w-full" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill={shade.hex} />
      <g stroke={shade.highlightHex} strokeWidth="0.9" opacity="0.55" strokeLinecap="round">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <line key={i} x1={round(20 + Math.cos(a) * 7.5)} y1={round(20 + Math.sin(a) * 7.5)} x2={round(20 + Math.cos(a) * 16)} y2={round(20 + Math.sin(a) * 16)} />;
        })}
      </g>
      <circle cx="20" cy="20" r="18" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="20" cy="20" r="6.5" fill="#0B0F17" />
      <circle cx="16.8" cy="16.4" r="2.4" fill="#fff" opacity="0.95" />
    </svg>
  );
}

/** Advance an index on a timer (paused while `paused`, when the tab is hidden, or with reduced motion). */
function useCycle(length, ms, paused) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || !motionAllowed()) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % length);
    }, ms);
    return () => clearInterval(id);
  }, [length, ms, paused]);
  return index;
}

/**
 * Where the iris looks: gx, gy in -1..1. It glances around on its own, and on
 * devices with a mouse it follows the pointer (resuming its own glances 2.5s after
 * the pointer stops). Returns spring-smoothed CSS translate percentages.
 */
function useGaze(eyeRef) {
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const sx = useSpring(gx, { stiffness: 90, damping: 15 });
  const sy = useSpring(gy, { stiffness: 90, damping: 15 });
  // The iris can travel 28% of its own width sideways and 6% up or down (the lids hide its edges)
  const x = useTransform(sx, (v) => `${v * 28}%`);
  const y = useTransform(sy, (v) => `${v * 6}%`);

  useEffect(() => {
    if (!motionAllowed()) return undefined;
    const glances = [[0, 0], [-1, 0.15], [-0.35, -0.4], [0.2, 0], [1, 0.2], [0.55, -0.35], [0, 0.35]];
    let step = 0;
    let lastPointer = 0;
    const timer = setInterval(() => {
      if (performance.now() - lastPointer < 2500 || document.visibilityState !== 'visible') return;
      step = (step + 1) % glances.length;
      gx.set(glances[step][0]);
      gy.set(glances[step][1]);
    }, GAZE_MS);
    const onMove = (e) => {
      if (e.pointerType !== 'mouse' || !eyeRef.current) return;
      lastPointer = performance.now();
      const r = eyeRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Measured against the visible part of the eye (most of it runs off-screen)
      const visibleHalf = Math.min(r.width, window.innerWidth) * 0.42;
      gx.set(Math.max(-1, Math.min(1, (e.clientX - cx) / visibleHalf)));
      gy.set(Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 1.6))));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointermove', onMove);
    };
  }, [eyeRef, gx, gy]);

  return { x, y };
}

export default function EyeStage() {
  const eyeRef = useRef(null);
  const [hoverShade, setHoverShade] = useState(null);
  const [hoverFrame, setHoverFrame] = useState(null);
  const autoShade = useCycle(EYE_SHADES.length, SHADE_MS, hoverShade !== null);
  const autoFrame = useCycle(FRAME_DESIGNS.length, FRAME_MS, hoverFrame !== null);
  const shadeIndex = hoverShade ?? autoShade;
  const frameIndex = hoverFrame ?? autoFrame;
  const shade = EYE_SHADES[shadeIndex];
  const frame = FRAME_DESIGNS[frameIndex];
  const gaze = useGaze(eyeRef);

  // Opening the eye on load (lid scale 0.06 -> 1)
  const open = useMotionValue(motionAllowed() ? 0.06 : 1);
  useEffect(() => {
    if (!motionAllowed()) return undefined;
    const a = animate(open, 1, { duration: 0.8, ease: EASE, delay: 0.25 });
    return () => a.stop();
  }, [open]);

  const lastShade = EYE_SHADES.length - 1;
  const lastFrame = FRAME_DESIGNS.length - 1;
  const fade = 'transition-[fill,stroke] duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)]';

  return (
    <div
      className="relative flex w-full flex-col items-center"
      style={{
        // Eye height (= iris diameter): from the screen height, capped by the width
        '--h': 'max(130px, min(36vw, 300px, calc((100svh - 280px) / 2.3)))',
        '--ew': 'calc(var(--h) * 2.6)', // eye width: the whole eye, corners included, stays on screen
        '--sw': 'clamp(26px, calc(var(--h) * 0.15), 50px)', // shade swatch size
        '--fw': 'clamp(48px, calc(var(--h) * 0.33), 104px)', // frame thumbnail size
      }}
    >
      {/* ---- 8 shades, arched over the eye ---- */}
      <ul
        aria-label="Eye shades"
        className="relative"
        style={{ width: 'min(92vw, calc(var(--h) * 3.1))', height: 'calc(var(--h) * 0.2 + var(--sw))' }}
      >
        {EYE_SHADES.map((s, i) => {
          const t = (i / lastShade) * 2 - 1; // -1 (left) .. 1 (right)
          const active = i === shadeIndex;
          return (
            <motion.li
              key={s.id}
              className="absolute"
              style={{
                left: `${50 + t * 45}%`,
                top: `calc(var(--h) * 0.2 * ${round(t * t)})`, // centre highest: follows the upper lid
                width: 'var(--sw)',
                height: 'var(--sw)',
                marginLeft: 'calc(var(--sw) / -2)',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 17, delay: 0.6 + i * 0.06 }}
            >
              <a
                href={STUDIO_URL}
                aria-label={`Try ${s.name} in the studio`}
                onMouseEnter={() => setHoverShade(i)}
                onMouseLeave={() => setHoverShade(null)}
                onFocus={() => setHoverShade(i)}
                onBlur={() => setHoverShade(null)}
                className={`block h-full w-full rounded-full transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
                  active ? 'scale-[1.3] ring-2 ring-gold ring-offset-2 ring-offset-paper' : 'hover:scale-110'
                }`}
              >
                <IrisSwatch shade={s} />
              </a>
            </motion.li>
          );
        })}
      </ul>

      {/* ---- The eye ---- */}
      <motion.div
        ref={eyeRef}
        className="relative shrink-0"
        style={{ width: 'var(--ew)', height: 'calc(var(--h) * 1.2)', marginTop: 'calc(var(--h) * 0.1)', scaleY: open }}
      >
        <div className="fx-blink absolute inset-0">
          {/* White of the eye, with the moving iris; everything clipped to the almond */}
          <a
            href={STUDIO_URL}
            aria-label={`Sample portrait in the ${frame.label} frame with ${shade.name} eyes. Make your own in the studio`}
            className="absolute inset-0 block overflow-hidden bg-[#FBFBF8]"
            style={{ mask: MASK, WebkitMask: MASK }}
          >
            <motion.div
              className="absolute left-1/2 will-change-transform"
              style={{ top: 'calc(var(--h) * 0.1)', width: 'var(--h)', height: 'var(--h)', marginLeft: 'calc(var(--h) / -2)', x: gaze.x, y: gaze.y }}
            >
              {/* Iris: colour of the highlighted shade, blending between shades */}
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <circle cx="50" cy="50" r="49.6" className={fade} style={{ fill: shade.hex }} />
                <g strokeWidth="0.7" strokeLinecap="round" opacity="0.55" className={fade} style={{ stroke: shade.highlightHex }}>
                  {FIBRES.map((f, i) => (
                    <line key={i} {...f} />
                  ))}
                </g>
                <circle cx="50" cy="50" r="33" fill="none" strokeWidth="2.2" opacity="0.45" className={fade} style={{ stroke: shade.highlightHex }} />
                <circle cx="50" cy="50" r="47.5" fill="none" strokeWidth="4" className={fade} style={{ stroke: darken(shade.hex, 0.4) }} />
              </svg>

              {/* Upright frame-sample card in the centre of the iris (the rectangle in the sketch):
                  the square framed portrait, as the studio exports it, with the frame's name below */}
              <div className="absolute left-1/2 top-1/2 flex aspect-[5/6] w-[52%] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[5%] bg-white p-[4.5%] shadow-[0_0_0_2px_rgba(11,15,23,0.85),0_10px_22px_-8px_rgba(0,0,0,0.65)]">
                <div className="relative aspect-square w-full overflow-hidden rounded-[3%] bg-stage">
                  {FRAME_DESIGNS.map((f, i) => (
                    <img
                      key={f.key}
                      src={asset(`landing-assets/frames/${f.key}.jpg`)}
                      alt=""
                      width="640"
                      height="640"
                      draggable="false"
                      className="absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
                      style={{ opacity: i === frameIndex ? 1 : 0 }}
                    />
                  ))}
                </div>
                <div className="relative grid flex-1 place-items-center" aria-hidden="true">
                  {FRAME_DESIGNS.map((f, i) => (
                    <span
                      key={f.key}
                      className="[grid-area:1/1] whitespace-nowrap font-slab font-semibold leading-none text-ink transition-opacity duration-500"
                      style={{ fontSize: 'calc(var(--h) * 0.05)', opacity: i === frameIndex ? 1 : 0 }}
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Catchlight */}
              <span aria-hidden="true" className="absolute left-[16%] top-[13%] h-[13%] w-[18%] -rotate-[30deg] rounded-full bg-white/45 blur-[1px]" />
            </motion.div>

            {/* Tear duct at the inner corner */}
            <svg viewBox="0 0 260 120" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <ellipse cx="13" cy="64" rx="8" ry="6.5" fill="#E7A49B" opacity="0.85" />
              <ellipse cx="11.5" cy="62.5" rx="2.4" ry="1.6" fill="#fff" opacity="0.7" />
            </svg>
            {/* Shadow cast by the upper lid */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_22px_26px_-18px_rgba(15,42,46,0.45)]" />
          </a>

          {/* Lids, crease and lashes */}
          <svg viewBox="0 0 260 120" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d={CREASE_D} fill="none" stroke="#0F2A2E" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
            <g fill="none" stroke="#0F2A2E" strokeLinecap="round">
              {UPPER_LASHES.map((d, i) => (
                <path key={`u${i}`} d={d} strokeWidth="1.7" />
              ))}
              {LOWER_LASHES.map((d, i) => (
                <path key={`l${i}`} d={d} strokeWidth="1" strokeOpacity="0.6" />
              ))}
            </g>
            <path d={LOWER_D} fill="none" stroke="#0F2A2E" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round" />
            <path d={UPPER_D} fill="none" stroke="#0F2A2E" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* Current shade and frame */}
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 'calc(var(--h) * -0.04)' }} aria-hidden="true">
          <div className="grid">
            <AnimatePresence initial={false}>
              <motion.span
                key={`${shade.id}-${frame.key}`}
                className="[grid-area:1/1] inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-stage px-3 py-1 text-xs font-semibold text-white shadow-md"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/50" style={{ background: shade.hex }} />
                {shade.name}
                <span className="text-white/40">·</span>
                {frame.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ---- 5 frames, curved under the eye ---- */}
      <ul
        aria-label="Frame designs"
        className="relative"
        style={{
          width: 'min(96vw, calc(var(--h) * 3.1))',
          height: 'calc(var(--h) * 0.12 + var(--fw) * 1.12)',
          marginTop: 'calc(var(--h) * 0.17)',
        }}
      >
        {FRAME_DESIGNS.map((f, i) => {
          const t = (i / lastFrame) * 2 - 1;
          const active = i === frameIndex;
          return (
            <motion.li
              key={f.key}
              className="absolute"
              style={{
                left: `${50 + t * 41}%`,
                top: `calc(var(--h) * 0.12 * ${round(1 - t * t)})`, // centre lowest: follows the lower lid
                width: 'var(--fw)',
                marginLeft: 'calc(var(--fw) / -2)',
                zIndex: active ? 10 : 5 - Math.abs(i - 2),
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.95 + i * 0.07 }}
            >
              <a
                href={STUDIO_URL}
                aria-label={`Try the ${f.label} frame in the studio`}
                onMouseEnter={() => setHoverFrame(i)}
                onMouseLeave={() => setHoverFrame(null)}
                onFocus={() => setHoverFrame(i)}
                onBlur={() => setHoverFrame(null)}
                className={`block rounded-[12px] bg-white p-1 shadow-[0_14px_28px_-14px_rgba(15,42,46,0.55)] ring-1 transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] ${
                  active ? 'ring-2 ring-gold' : 'ring-line'
                }`}
                style={{ transform: `rotate(${round(t * -9)}deg) translateY(${active ? '-10px' : '0px'}) scale(${active ? 1.12 : 1})` }}
              >
                <img
                  src={asset(`landing-assets/frames/${f.key}.jpg`)}
                  alt=""
                  width="640"
                  height="640"
                  draggable="false"
                  className="block aspect-square w-full select-none rounded-[9px] object-cover"
                />
              </a>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
