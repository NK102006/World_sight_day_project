// ============================================================================
// Buttons.jsx
// Pill-shaped link buttons.
//  PrimaryButton   gold fill, ink text, light sheen sweep on hover, presses to 0.97
//  SecondaryButton outline in ink (or white on navy), presses to 0.97
// ============================================================================
import { motion } from 'framer-motion';

const BASE =
  'group relative isolate inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-full font-semibold ' +
  'transition-colors duration-300';

const SIZES = {
  md: 'h-12 px-6 text-base',
  sm: 'h-10 px-3.5 text-[0.82rem] min-[400px]:px-4 min-[400px]:text-sm md:px-5',
};

const press = { scale: 0.97 };

export function PrimaryButton({ href, size = 'md', className = '', children, ...rest }) {
  return (
    <motion.a
      href={href}
      whileTap={press}
      className={`${BASE} ${SIZES[size]} bg-gold text-ink hover:bg-[#FF8466] ${className}`}
      {...rest}
    >
      {/* Soft light bar moved by CSS (landing.css .sheen), transform only */}
      <span aria-hidden="true" className="sheen pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/3 bg-white/35 blur-[6px]" />
      {children}
    </motion.a>
  );
}

export function SecondaryButton({ href, size = 'md', tone = 'light', className = '', children, ...rest }) {
  const toneClass =
    tone === 'dark'
      ? 'border-2 border-white/80 text-white hover:bg-white/10'
      : 'border-2 border-ink text-ink hover:bg-ink/[0.06]';
  return (
    <motion.a href={href} whileTap={press} className={`${BASE} ${SIZES[size]} ${toneClass} ${className}`} {...rest}>
      {children}
    </motion.a>
  );
}
