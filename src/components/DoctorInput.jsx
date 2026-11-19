import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * DoctorInput.jsx
 * Doctor name and caption line. Both are required.
 */
export default function DoctorInput({ doctorName, onDoctorNameChange, clinicSubtitle, onClinicSubtitleChange, showRequired }) {
  // A field shows its "required" error once it has been left empty, or after a blocked download
  const [touched, setTouched] = useState({});
  const nameError = (touched.name || showRequired) && !doctorName.trim();
  const captionError = (touched.caption || showRequired) && !clinicSubtitle.trim();

  const fieldClass = (bad) =>
    `w-full rounded-[14px] border-[1.5px] bg-white px-3.5 py-2.5 text-[15px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-0 ${
      bad ? 'border-red-500 focus:border-red-600' : 'border-line focus:border-[color:var(--accent,#0E5E5E)]'
    }`;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="doctor-name" className="mb-1.5 flex items-baseline justify-between text-[13px] font-extrabold">
          <span>
            Doctor's name
            <RequiredMark />
          </span>
          <span className="font-mono text-xs font-medium text-ink-faint">{doctorName.length}/60</span>
        </label>
        <input
          id="doctor-name"
          type="text"
          value={doctorName}
          maxLength={60}
          required
          aria-required="true"
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? 'doctor-name-error' : 'doctor-name-hint'}
          placeholder="e.g. Aarav Mehta"
          onChange={(e) => onDoctorNameChange(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          className={fieldClass(nameError)}
        />
        {nameError ? (
          <FieldError id="doctor-name-error">Enter the doctor’s name.</FieldError>
        ) : (
          <p id="doctor-name-hint" className="mt-1.5 text-[13px] font-medium text-ink-faint">
            "Dr." is added for you.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="doctor-subtitle" className="mb-1.5 flex items-baseline justify-between text-[13px] font-extrabold">
          <span>
            Caption
            <RequiredMark />
          </span>
          <span className="font-mono text-xs font-medium text-ink-faint">{clinicSubtitle.length}/90</span>
        </label>
        <input
          id="doctor-subtitle"
          type="text"
          value={clinicSubtitle}
          maxLength={90}
          required
          aria-required="true"
          aria-invalid={captionError || undefined}
          aria-describedby={captionError ? 'doctor-subtitle-error' : undefined}
          placeholder="e.g. Committed to Preserving Vision • World Sight Day"
          onChange={(e) => onClinicSubtitleChange(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, caption: true }))}
          className={fieldClass(captionError)}
        />
        {captionError && <FieldError id="doctor-subtitle-error">Enter a caption.</FieldError>}
      </div>
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-red-600" aria-hidden="true">
      *
    </span>
  );
}

function FieldError({ id, children }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-red-700">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}
