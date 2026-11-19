import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, SwitchCamera, Timer, X, Check, RotateCcw } from 'lucide-react';

/**
 * CameraCapture.jsx
 * Full-screen live camera for taking the portrait photo in the studio.
 *  - front camera by default (mirrored like a selfie camera), switch to the back camera
 *  - oval face guide, optional 3-second timer, Space / Enter to take the photo
 *  - review the shot: Retake or Use photo
 * The photo is returned as a JPEG data URL through onCapture, then goes through the
 * normal photo editor (and is saved for the event like an uploaded photo).
 *
 * Live camera access needs a secure page (https:// or localhost). PhotoUploader
 * checks cameraSupported() first and otherwise opens the phone's own camera app.
 */
export const cameraSupported = () =>
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

const ERRORS = {
  NotAllowedError: 'Camera access was blocked. Allow the camera in your browser (the camera icon in the address bar), or upload a photo instead.',
  SecurityError: 'Camera access was blocked. Allow the camera in your browser, or upload a photo instead.',
  NotFoundError: 'No camera was found on this device. Upload a photo instead.',
  OverconstrainedError: 'That camera is not available. Try switching cameras.',
  NotReadableError: 'The camera is being used by another app. Close it and try again.',
};

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const shutterRef = useRef(null);
  const [facing, setFacing] = useState('user'); // 'user' = front, 'environment' = back
  const [cameraCount, setCameraCount] = useState(1);
  const [status, setStatus] = useState('starting'); // starting | live | error
  const [error, setError] = useState('');
  const [timerOn, setTimerOn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [shot, setShot] = useState(null); // captured data URL while reviewing
  const [flash, setFlash] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Start (or restart) the camera whenever the chosen camera changes
  useEffect(() => {
    let cancelled = false;
    setStatus('starting');
    setError('');
    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setStatus('live');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameraCount(devices.filter((d) => d.kind === 'videoinput').length || 1);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(ERRORS[err?.name] || 'The camera could not be started. Upload a photo instead.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing]);

  // Release the camera when the window closes
  useEffect(() => () => stopStream(), []);

  // Lock page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const mirrored = facing === 'user';

  /** Grab the current video frame (as seen on screen, so a selfie stays mirrored). */
  const grab = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    setShot(canvas.toDataURL('image/jpeg', 0.92));
  }, [mirrored]);

  const takePhoto = useCallback(() => {
    if (status !== 'live' || shot || countdown) return;
    if (!timerOn) return grab();
    setCountdown(3);
  }, [status, shot, countdown, timerOn, grab]);

  // Timer: 3, 2, 1, photo
  useEffect(() => {
    if (!countdown) return undefined;
    const id = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(0);
        grab();
      } else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, grab]);

  // Keyboard: Esc closes, Space / Enter takes the photo
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if ((e.key === ' ' || e.key === 'Enter') && !shot && e.target === document.body) {
        e.preventDefault();
        takePhoto();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, takePhoto, shot]);

  useEffect(() => {
    if (status === 'live') shutterRef.current?.focus();
  }, [status]);

  const acceptPhoto = () => {
    stopStream();
    onCapture(shot);
  };

  const iconBtn =
    'inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Take a photo" className="fixed inset-0 z-[100] flex flex-col bg-[#0B1324] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div>
          <p className="font-display text-lg font-semibold">Take a photo</p>
          <p className="text-xs text-white/60">Face the camera in even light, both eyes open.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close camera" className={iconBtn}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Camera / review area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''} ${shot ? 'invisible' : ''}`}
        />
        {shot && <img src={shot} alt="Your photo" className="absolute inset-0 h-full w-full object-contain" />}

        {/* Oval face guide */}
        {status === 'live' && !shot && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[3/4] h-[62%] max-w-[70%] rounded-[50%] border-2 border-dashed border-gold/90 shadow-[0_0_0_9999px_rgba(11,19,36,0.35)]">
              <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-stage/80 px-3 py-1 text-xs font-medium">
                Fit your face in the oval
              </span>
            </div>
          </div>
        )}

        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span key={countdown} className="font-display text-[8rem] font-semibold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {countdown}
            </span>
          </div>
        )}
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
            <RefreshCw className="h-4 w-4 animate-spin" /> Starting the camera…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl bg-white/10 p-5 text-center">
              <Camera className="mx-auto h-8 w-8 text-white/70" />
              <p className="mt-3 text-[15px] leading-relaxed">{error}</p>
              <button type="button" onClick={onClose} className="mt-4 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-ink">
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 px-4 pb-6 pt-4">
        {shot ? (
          <>
            <button type="button" onClick={() => setShot(null)} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">
              <RotateCcw className="h-4 w-4" /> Retake
            </button>
            <button type="button" onClick={acceptPhoto} autoFocus className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink hover:bg-[#FF8466]">
              <Check className="h-4 w-4" /> Use photo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setTimerOn((v) => !v)}
              aria-pressed={timerOn}
              title="3-second timer"
              className={`${iconBtn} ${timerOn ? '!bg-gold !text-ink' : ''}`}
              disabled={status !== 'live'}
            >
              <Timer className="h-5 w-5" />
            </button>
            <button
              ref={shutterRef}
              type="button"
              onClick={takePhoto}
              disabled={status !== 'live' || countdown > 0}
              aria-label="Take photo"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-95 disabled:opacity-40"
            >
              <span className="h-[56px] w-[56px] rounded-full bg-white" />
            </button>
            <button
              type="button"
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              title="Switch camera"
              aria-label="Switch camera"
              className={iconBtn}
              disabled={status !== 'live' || cameraCount < 2}
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
