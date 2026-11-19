// ============================================================================
// LandingApp.jsx
// Eye Shade Studio landing page: the site's front page (/), one screen, no scroll.
// Heading, the eye showcase (EyeStage: portrait inside an eye, 8 shades above,
// 5 frames below), and one button. Everything leads to the studio at /studio/.
// MotionConfig reducedMotion="user" turns off movement for visitors who asked
// their device for reduced motion (the showcase then stays still).
// ============================================================================
import { MotionConfig, motion } from 'framer-motion';
import EyeLogo from './components/EyeLogo';
import EyeStage from './components/EyeStage';
import { PrimaryButton } from './components/Buttons';
import { EASE } from './lib/motion';
import { STUDIO_URL } from './lib/layout';

const rise = (delay) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
});

export default function LandingApp() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-[100svh] flex-col overflow-hidden">
        {/* Top bar */}
        <motion.header {...rise(0)} className="flex items-center justify-between gap-4 px-4 pt-3 md:px-8 md:pt-5">
          <a href="./" aria-label="Eye Shade Studio home" className="flex items-center gap-2.5 rounded-full">
            <EyeLogo alive tone="onLight" size={34} />
            {/* Wordmark hidden on the narrowest phones so the bar stays on one line */}
            <span className="hidden whitespace-nowrap font-slab text-lg font-semibold text-ink min-[375px]:inline">
              Eye Shade Studio
            </span>
          </a>
          <a
            href={STUDIO_URL}
            className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.06]"
          >
            Open the studio <span aria-hidden="true">→</span>
          </a>
        </motion.header>

        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-4 text-center">
          <motion.h1
            {...rise(0.1)}
            className="font-slab font-semibold leading-[1.05] text-ink"
            style={{ fontSize: 'clamp(1.7rem, min(5.4vw, 5.6svh), 3.4rem)' }}
          >
            Shade of <span className="underline decoration-gold decoration-[4px] underline-offset-[8px]">eyes</span>
          </motion.h1>
          <motion.p {...rise(0.18)} className="mt-2 max-w-[34rem] text-[0.95rem] text-ink-soft md:text-lg">
            Make a framed World Sight Day portrait in under a minute.
          </motion.p>

          <div className="mt-4 md:mt-6">
            <EyeStage />
          </div>

          <motion.div {...rise(1.15)} className="mt-3 flex flex-col items-center gap-2 md:mt-5">
            <PrimaryButton href={STUDIO_URL}>Make your portrait</PrimaryButton>
            <p className="text-xs text-ink-soft">Free · Photos are saved for this World Sight Day event · 1000 × 1000 px PNG</p>
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  );
}
