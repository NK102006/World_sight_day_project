// Shared motion settings for the landing page.

/** The page's one easing curve: calm, quick out, long settle. */
export const EASE = [0.2, 0.7, 0.2, 1];

/** True unless the visitor asked their device for reduced motion. */
export function motionAllowed() {
  return typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
