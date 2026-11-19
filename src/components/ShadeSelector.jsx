import React from 'react';
import { Check } from 'lucide-react';

/**
 * ShadeSelector.js
 * Choose one of the four curated eye shades and set the blend strength.
 */
export const EYE_SHADES = [
  {
    id: 'light-blue',
    name: 'Light Blue',
    hex: '#7FB2D6',
    highlightHex: '#C9E4F5',
    description: 'Icy pale blue',
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#4A7FB0',
    highlightHex: '#9CC4E4',
    description: 'Natural sky & sapphire blue',
  },
  {
    id: 'grey',
    name: 'Grey',
    hex: '#7D8A93',
    highlightHex: '#C5CED4',
    description: 'Soft steel grey',
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#5C7344',
    highlightHex: '#A39A5C',
    description: 'Hazel green with golden flecks',
  },
  {
    id: 'hazel',
    name: 'Hazel',
    hex: '#7A6A3A',
    highlightHex: '#B8A463',
    description: 'Brown-gold hazel rings',
  },
  {
    id: 'amber',
    name: 'Amber',
    hex: '#A0692A',
    highlightHex: '#E0B066',
    description: 'Golden amber',
  },
  {
    id: 'brown',
    name: 'Brown',
    hex: '#6E4A2A',
    highlightHex: '#B07D45',
    description: 'Natural chestnut brown',
  },
  {
    id: 'dark-brown',
    name: 'Dark Brown',
    hex: '#3E2A1A',
    highlightHex: '#7A5234',
    description: 'Deep espresso brown',
  },
];


// Mix a hex colour toward black. f = 1 keeps the colour, 0 gives black.
const shadeTone = (hex, f) => {
  const n = parseInt((hex || '#2563EB').replace('#', ''), 16);
  const ch = (v) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

// Iris only: coloured iris with fibres, limbal ring, pupil and catchlight. No eyelid or sclera.
function EyeSwatch({ shade, className = 'h-11 w-11' }) {
  const id = `iris-${shade.id}`;
  const base = shade.hex;
  const light = shade.highlightHex || shade.hex;
  const dark = shadeTone(base, 0.42);
  const deep = shadeTone(base, 0.2);
  const cx = 20;
  const cy = 20;
  const fibres = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2;
    return (
      <line
        key={i}
        x1={cx + Math.cos(angle) * 7}
        y1={cy + Math.sin(angle) * 7}
        x2={cx + Math.cos(angle) * 15}
        y2={cy + Math.sin(angle) * 15}
        stroke={light}
        strokeWidth="0.8"
        strokeOpacity="0.4"
      />
    );
  });
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={deep} />
          <stop offset="38%" stopColor={base} />
          <stop offset="78%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="17" fill={`url(#${id})`} />
      {fibres}
      <circle cx={cx} cy={cy} r="17" fill="none" stroke={dark} strokeWidth="1.8" />
      <circle cx={cx} cy={cy} r="6.5" fill="#0b0f14" />
      <circle cx={cx - 3} cy={cy - 3.5} r="2.4" fill="#ffffff" opacity="0.95" />
      <circle cx={cx + 4} cy={cy + 4} r="1" fill="#ffffff" opacity="0.5" />
    </svg>
  );
}

export default function ShadeSelector({ activeShade, onSelectShade, shadeIntensity, onIntensityChange }) {
  const pct = Math.round(shadeIntensity * 100);
  const fill = `${((shadeIntensity - 0.2) / 0.8) * 100}%`;

  return (
    <div>
      {/* All eight irises in one row: the choice is the colour, so the colour is the control */}
      <div role="radiogroup" aria-label="Eye colour" className="grid grid-cols-8 gap-1 rounded-full bg-stage p-1.5 sm:gap-2 sm:p-2">
        {EYE_SHADES.map((shade) => {
          const active = activeShade?.id === shade.id;
          return (
            <button
              key={shade.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={shade.name}
              title={shade.name}
              onClick={() => onSelectShade(shade)}
              className={`relative aspect-square rounded-full p-[2px] transition-transform duration-200 ${
                active ? 'fx-pop scale-105 ring-[2.5px] ring-gold ring-offset-2 ring-offset-stage' : 'opacity-90 hover:scale-105 hover:opacity-100'
              }`}
            >
              <EyeSwatch shade={shade} className="h-full w-full" />
            </button>
          );
        })}
      </div>
      <p key={activeShade?.id} className="fx-note mt-3 text-[15px]" aria-live="polite">
        <span className="font-extrabold">{activeShade?.name}</span>
        <span className="font-medium text-ink-soft"> · {activeShade?.description?.toLowerCase()}</span>
      </p>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="shade-intensity" className="text-[13px] font-extrabold">
            Strength
          </label>
          <span className="font-mono text-[13px] font-bold tabular-nums text-[color:var(--accent,#0E5E5E)]" title={`${pct}%`}>
            +{shadeIntensity.toFixed(2)}
          </span>
        </div>
        <div aria-hidden className="scale-ticks mb-1.5 h-4" />
        <input
          id="shade-intensity"
          type="range"
          min="0.2"
          max="1"
          step="0.01"
          value={shadeIntensity}
          onChange={(e) => onIntensityChange(parseFloat(e.target.value))}
          className="shade-range w-full"
          style={{ '--fill': fill }}
        />
        <div className="mt-1.5 flex justify-between text-xs font-semibold text-ink-faint">
          <span>Subtle</span>
          <span>Vivid</span>
        </div>
      </div>
    </div>
  );
}
