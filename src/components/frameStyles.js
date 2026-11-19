// World Sight Day frame: one colour palette, four layout designs.
export const FRAME_PALETTE = {
  bandStops: ['#0C4A6E', '#0E7490', '#312E81'],
  panel: ['rgba(8, 24, 48, 0)', 'rgba(8, 24, 48, 0.84)', 'rgba(4, 14, 32, 0.96)'],
  innerLine: 'rgba(186, 230, 253, 0.75)',
  outerLine: 'rgba(255, 255, 255, 0.28)',
  accent: '#A5F3FC',
  badgeStops: ['#0F172A', '#0C4A6E'],
  badgeStroke: 'rgba(165, 243, 252, 0.85)',
  badgeText: '#E0F2FE',
  iris: '#38BDF8',
  eyeWhite: '#E0F2FE',
  pupil: '#0F172A',
  divider: 'rgba(103, 232, 249, 0.95)',
  caption: '#BAE6FD',
  name: '#FFFFFF',
};

export const FRAME_DESIGNS = [
  { key: 'classic', label: 'Classic', hint: 'Border with eyes on divider' },
  { key: 'editorial', label: 'Caption bar', hint: 'Solid bar, left-aligned name' },
  { key: 'circle', label: 'Medallion', hint: 'Circular portrait with ring' },
  { key: 'polaroid', label: 'Card', hint: 'White instant-photo border' },
  { key: 'poster', label: 'Awareness poster', hint: 'Headline, date and action tips' },
];

export const DEFAULT_FRAME_STYLE = 'classic';
