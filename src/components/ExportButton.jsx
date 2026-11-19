import React, { useState } from 'react';
import { Download, Check, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import { saveDownload } from '../services/eventStore';
import { FRAME_DESIGNS } from './frameStyles';

/**
 * ExportButton.jsx
 * Download the 1000×1000 composite as PNG. Sits at the foot of the dark stage.
 * Visitors: a copy of every download is also sent to the event server
 * (storage/2.Downloaded Image).
 * Admin editing mode (editing = { ready, name }): a "Save to record" button stores
 * the edited portrait in that doctor's record; "Download" then only downloads.
 */
export default function ExportButton({
  canvasRef,
  doctorName,
  clinicSubtitle,
  activeShade,
  frameStyle,
  shadeIntensity,
  adjust,
  editing,
  isProcessing,
  missing = [],
  onBlocked,
}) {
  // The doctor's name and caption must be filled in first
  const blocked = missing.length > 0;
  const blockedText = `Add the ${missing.join(' and ')} to ${editing ? 'save or download' : 'download'} the portrait.`;
  const [downloaded, setDownloaded] = useState(false);
  const [save, setSave] = useState({ state: 'idle' }); // idle | saving | saved | error

  const cleanName =
    (doctorName || 'Doctor')
      .replace(/^dr\.?\s*/i, '')
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase() || 'doctor';
  const fileName = `World_Sight_Day_Dr_${cleanName}_${activeShade?.id || 'shade'}.png`;

  const meta = () => ({
    doctorName,
    caption: clinicSubtitle,
    shade: activeShade,
    frame: FRAME_DESIGNS.find((d) => d.key === frameStyle),
    shadeIntensity,
    adjust,
  });

  const handleDownload = () => {
    if (blocked) return onBlocked?.();
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png', 1.0);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (!editing) saveDownload(canvas, meta()); // visitors only; the admin saves with "Save to record"
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const handleSave = async () => {
    if (blocked) return onBlocked?.();
    setSave({ state: 'saving' });
    const res = await saveDownload(canvasRef?.current, meta());
    if (res.ok) {
      setSave({ state: 'saved' });
      setTimeout(() => setSave({ state: 'idle' }), 3000);
    } else {
      setSave({
        state: 'error',
        message:
          res.status === 401
            ? 'Your admin sign-in has ended. Sign in on the admin page and try again.'
            : res.status === 404
              ? 'This doctor’s record no longer exists.'
              : 'Could not save. Is the server running?',
      });
    }
  };

  // The download button is a slip: "Download portrait" with a tear-off stub
  return (
    <div className="mt-3">
      {editing && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isProcessing || !editing.ready || save.state === 'saving'}
          title={editing.ready ? `Save this portrait to ${editing.name}’s record` : 'The record is not loaded'}
          className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-mint px-5 py-3 text-[15px] font-extrabold text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.state === 'saving' ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : save.state === 'saved' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved to record' : 'Save to record'}
        </button>
      )}
      <button
        type="button"
        onClick={handleDownload}
        disabled={isProcessing}
        title={fileName}
        aria-disabled={blocked || undefined}
        className={`group flex w-full items-stretch overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${blocked ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className="flex flex-1 items-center gap-3 bg-gold-deep px-4 py-3.5 text-white transition-colors group-hover:bg-[#C9431F] sm:px-5">
          <span className="text-[16px] font-extrabold sm:text-[17px]">
            {downloaded ? 'Downloaded' : editing ? 'Download only' : 'Download portrait'}
          </span>
          {downloaded ? <Check className="ml-auto h-5 w-5" /> : <Download className="ml-auto h-5 w-5 opacity-80" />}
        </span>
        <span className="flex flex-col justify-center border-l-[3px] border-dashed border-stage bg-gold-tint px-3.5 font-mono text-[11px] font-bold leading-tight text-ink sm:px-4">
          <span>1000 × 1000</span>
          <span className="opacity-60">PNG{editing ? '' : ' · saved'}</span>
        </span>
      </button>
      {blocked && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-gold">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {blockedText}
        </p>
      )}
      {save.state === 'error' && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {save.message}
        </p>
      )}
      {save.state === 'saved' && (
        <p role="status" className="mt-2 text-[13px] text-white/75">
          Saved to {doctorName ? (/^dr\.?\s/i.test(doctorName) ? doctorName : `Dr. ${doctorName}`) : 'the doctor'}’s record. It now shows in the
          admin page.
        </p>
      )}
    </div>
  );
}
