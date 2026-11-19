import React from 'react';
import { FRAME_DESIGNS } from './frameStyles';

// Small line drawings of each frame layout, so the choice can be made by eye.
const SKETCH = {
  classic: (
    <>
      <rect x="3" y="3" width="42" height="42" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="6" y="31" width="36" height="11" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="18" y="6" width="12" height="4" rx="2" fill="currentColor" />
    </>
  ),
  editorial: (
    <>
      <rect x="3" y="33" width="42" height="12" fill="currentColor" />
      <rect x="7" y="37" width="18" height="2.5" rx="1" fill="#fff" />
      <rect x="6" y="6" width="14" height="5" rx="2.5" fill="currentColor" />
    </>
  ),
  circle: (
    <>
      <path d="M3 3h42v42H3z M24 7a14 14 0 1 0 0.01 0z" fill="currentColor" fillRule="evenodd" opacity="0.85" />
      <circle cx="24" cy="21" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  polaroid: (
    <path d="M3 3h42v42H3z M8 8v27h32V8z" fill="currentColor" fillRule="evenodd" opacity="0.2" stroke="currentColor" strokeWidth="1.5" />
  ),
  poster: (
    <>
      <rect x="3" y="3" width="42" height="9" fill="currentColor" />
      <rect x="3" y="33" width="42" height="12" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="40" r="1.6" fill="#fff" />
      <circle cx="24" cy="40" r="1.6" fill="#fff" />
      <circle cx="36" cy="40" r="1.6" fill="#fff" />
    </>
  ),
};

export default function FramePicker({ value, onChange }) {
  const current = FRAME_DESIGNS.find((d) => d.key === value);
  return (
    <div>
      <div role="radiogroup" aria-label="Frame design" className="grid grid-cols-5 gap-2">
        {FRAME_DESIGNS.map((d) => {
          const active = value === d.key;
          return (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(d.key)}
              className={`flex flex-col items-center gap-1.5 rounded-[14px] px-1 pb-2 pt-2.5 transition-[color,background-color,border-color,transform] duration-200 ${
                active
                  ? 'fx-pop-soft border-2 border-[color:var(--accent,#0F2A2E)] bg-[color:var(--tint,#D3ECE4)] text-ink shadow-[0_8px_18px_-12px_var(--accent,#0F2A2E)]'
                  : 'border-[1.5px] border-line bg-white text-ink-soft hover:-translate-y-0.5 hover:border-ink/40 hover:text-ink'
              }`}
            >
              <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
                <rect x="3" y="3" width="42" height="42" fill={active ? '#FFFDF8' : '#EEEADF'} />
                {SKETCH[d.key]}
              </svg>
              <span className={`text-center text-xs leading-tight ${active ? 'font-extrabold' : 'font-bold'}`}>{d.label}</span>
            </button>
          );
        })}
      </div>
      {current && <p className="mt-3 text-[13px] font-medium text-ink-soft">{current.hint}.</p>}
    </div>
  );
}
