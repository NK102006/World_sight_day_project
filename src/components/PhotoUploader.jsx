import React, { useRef, useState } from 'react';
import { Upload, Camera, RefreshCw, AlertOctagon, ScanFace, X } from 'lucide-react';
import { SAMPLE_PHOTO } from '../assets';
import CameraCapture, { cameraSupported } from './CameraCapture';

/**
 * PhotoUploader.jsx
 * Two ways to add the doctor's photo, plus drag and drop:
 *  - Upload photo: pick an image file
 *  - Take photo:   live camera inside the studio (CameraCapture). Where the browser
 *                  does not allow live camera access (pages not on https:// or
 *                  localhost, e.g. a phone opening the computer's Wi-Fi address),
 *                  it opens the device's own camera app instead.
 * Either way the photo is then checked (face, eyes, light, focus; see services/photoCheck.js)
 * and, if it passes, opened in the photo editor (onImageUpload in App.jsx).
 * check: null | { status: 'checking' } | { status: 'failed', problems, unavailable }
 */
export default function PhotoUploader({ uploadedImage, onImageUpload, isProcessing, check, onUseAnyway, onDismissCheck }) {
  const inputRef = useRef(null);
  const captureRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const isSample = uploadedImage === SAMPLE_PHOTO;
  const checking = check?.status === 'checking';
  const failed = check?.status === 'failed';

  const readFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image. Choose a JPG, PNG or WEBP photo.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => onImageUpload(reader.result);
    reader.readAsDataURL(file);
  };

  const takePhoto = () => {
    setError('');
    if (cameraSupported()) setCameraOpen(true);
    else captureRef.current?.click(); // device camera app
  };

  const button =
    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors sm:flex-none';

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-2xl border-[1.5px] border-dashed p-3 transition-colors ${
          dragOver ? 'border-gold bg-gold-tint' : 'border-ink-faint/70 bg-white'
        }`}
      >
        <div className="flex items-center gap-4">
          <img src={uploadedImage} alt="Selected portrait" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">{isSample ? 'Sample portrait' : 'Your photo'}</p>
            <p className="mt-0.5 text-[13px] font-medium text-ink-soft">Upload a photo, take one now, or drop a photo here</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={checking} className={`${button} bg-ink text-white hover:bg-teal disabled:cursor-wait disabled:opacity-60`}>
            <Upload className="h-4 w-4" />
            Upload photo
          </button>
          <button type="button" onClick={takePhoto} disabled={checking} className={`${button} border-[1.5px] border-ink bg-white text-ink hover:bg-ink/[0.05] disabled:cursor-wait disabled:opacity-60`}>
            <Camera className="h-4 w-4" />
            Take photo
          </button>
        </div>
      </div>

      {checking && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-[color:var(--tint,#D3ECE4)] px-3.5 py-2.5 text-[13px] font-semibold text-ink">
          <ScanFace className="h-4 w-4 shrink-0 animate-pulse text-[color:var(--accent,#0E5E5E)]" />
          Checking the photo: face, eyes, light and focus…
        </p>
      )}

      {failed && (
        <div role="alert" className="fx-note mt-3 rounded-2xl border-[1.5px] border-red-300 bg-red-50 p-3.5 text-red-900">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold">{check.unavailable ? 'The photo could not be checked' : 'This photo can’t be used'}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] font-medium leading-snug">
                {check.problems.map((p) => (
                  <li key={p.id}>{p.message}</li>
                ))}
              </ul>
              {!check.unavailable && (
                <p className="mt-2 text-[12.5px] font-medium text-red-800/80">
                  Tip: one person, facing the camera, eyes wide open, in good even light, with the face filling much of the photo.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-red-800">
                  <Upload className="h-3.5 w-3.5" /> Choose another photo
                </button>
                {check.unavailable && (
                  <button type="button" onClick={onUseAnyway} className="rounded-full border-[1.5px] border-red-700 px-3.5 py-1.5 text-[12.5px] font-bold text-red-800 hover:bg-red-100">
                    Use this photo anyway
                  </button>
                )}
              </div>
            </div>
            <button type="button" onClick={onDismissCheck} aria-label="Close this message" className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-700 hover:bg-red-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* File picker */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {/* Device camera app (used when live camera access is not available) */}
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(dataUrl) => {
            setCameraOpen(false);
            onImageUpload(dataUrl);
          }}
        />
      )}

      <p className="mt-2 text-[13px] font-medium text-ink-faint">
        {isProcessing ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Finding eyes…
          </span>
        ) : (
          'A front-facing, evenly lit photo works best.'
        )}
      </p>
      {error && <p className="mt-1 text-[13px] font-medium text-rose-700">{error}</p>}
    </div>
  );
}
