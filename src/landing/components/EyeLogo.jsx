// ============================================================================
// EyeLogo.jsx
// White almond eye, gold iris, navy pupil, inside a soft circle.
// When `alive`: blinks ~2s after load (0.25s), then every 8-10s, and the iris
// drifts a couple of pixels toward the mouse pointer. Skipped with reduced motion.
// SVG transforms are written as attributes from motion values (no re-renders).
// ============================================================================
import { useEffect, useId, useRef } from 'react';
import { animate, useMotionValue, useMotionValueEvent, useSpring } from 'framer-motion';
import { motionAllowed } from '../lib/motion';

const MAX_SHIFT = 2.2;
const ALMOND = 'M6.5 20C11 13.2 15.4 10.6 20 10.6S29 13.2 33.5 20C29 26.8 24.6 29.4 20 29.4S11 26.8 6.5 20Z';

export default function EyeLogo({ size = 40, tone = 'onDark', alive = false, className = '' }) {
  const clipId = `eye-clip${useId().replace(/[^a-zA-Z0-9]/g, '')}`; // colons break url(#id)
  const svgRef = useRef(null);
  const eyeRef = useRef(null);
  const irisRef = useRef(null);

  const lid = useMotionValue(1);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const irisX = useSpring(targetX, { stiffness: 120, damping: 18 });
  const irisY = useSpring(targetY, { stiffness: 120, damping: 18 });

  useMotionValueEvent(lid, 'change', (v) => {
    eyeRef.current?.setAttribute('transform', `translate(0 20) scale(1 ${v}) translate(0 -20)`);
  });
  const moveIris = () =>
    irisRef.current?.setAttribute('transform', `translate(${irisX.get().toFixed(2)} ${irisY.get().toFixed(2)})`);
  useMotionValueEvent(irisX, 'change', moveIris);
  useMotionValueEvent(irisY, 'change', moveIris);

  // Blink schedule
  useEffect(() => {
    if (!alive || !motionAllowed()) return undefined;
    let timer;
    let anim;
    const blink = () => {
      anim = animate(lid, [1, 0.08, 1], { duration: 0.25, times: [0, 0.45, 1], ease: 'easeInOut' });
      timer = setTimeout(blink, 8000 + Math.random() * 2000);
    };
    timer = setTimeout(blink, 2000);
    return () => {
      clearTimeout(timer);
      anim?.stop();
    };
  }, [alive, lid]);

  // Iris follows the mouse / pen (touch would only jitter)
  useEffect(() => {
    if (!alive || !motionAllowed()) return undefined;
    const onMove = (e) => {
      if (e.pointerType === 'touch' || !svgRef.current) return;
      const box = svgRef.current.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(dist / 240, 1) * MAX_SHIFT;
      targetX.set((dx / dist) * pull);
      targetY.set((dy / dist) * pull * 0.6);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [alive, targetX, targetY]);

  const disc = tone === 'onDark' ? { fill: '#FFFFFF', opacity: 0.12 } : { fill: '#0B2326', opacity: 1 };

  return (
    <svg ref={svgRef} viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="20" cy="20" r="20" fill={disc.fill} fillOpacity={disc.opacity} />
      <defs>
        <clipPath id={clipId}>
          <path d={ALMOND} />
        </clipPath>
      </defs>
      <g ref={eyeRef}>
        <path d={ALMOND} fill="#FFFFFF" />
        <g clipPath={`url(#${clipId})`}>
          <g ref={irisRef}>
            <circle cx="20" cy="20" r="6" fill="#FF6B4A" />
            <circle cx="20" cy="20" r="2.6" fill="#0B2326" />
            <circle cx="21.9" cy="18.1" r="1" fill="#FFFFFF" />
          </g>
        </g>
      </g>
    </svg>
  );
}
