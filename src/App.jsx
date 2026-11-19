import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ArrowLeft, ShieldCheck, Check, Camera, Eye, PenLine, Frame } from 'lucide-react';
import Header from './components/Header';
import PhotoUploader from './components/PhotoUploader';
import ShadeSelector, { EYE_SHADES } from './components/ShadeSelector';
import DoctorInput from './components/DoctorInput';
import CanvasPreview from './components/CanvasPreview';
import ExportButton from './components/ExportButton';
import PhotoEditor from './components/PhotoEditor';
import FramePicker from './components/FramePicker';
import { DEFAULT_ADJUST, isDefaultAdjust } from './services/imageAdjust';
import { DEFAULT_FRAME_STYLE, FRAME_DESIGNS } from './components/frameStyles';
import { SAMPLE_PHOTO } from './assets';
import { savePhoto, setEditTarget, loadRecordForEdit, adminPhotoUrl, ADMIN_PAGE } from './services/eventStore';
import { checkPhoto } from './services/photoCheck';

// Admin editing mode: /studio/?edit=<record id> (opened from the admin page's "Edit in studio")
const EDIT_ID = new URLSearchParams(window.location.search).get('edit');
const nameOf = (n) => (n ? (/^dr\.?\s/i.test(n) ? n : `Dr. ${n}`) : 'this doctor');

/** Strip at the top of the studio while the admin is editing a doctor. */
function EditBanner({ edit }) {
  const messages = {
    loading: 'Loading the doctor’s record…',
    signin: 'Sign in to the admin page first, then press “Edit in studio” again.',
    missing: 'This doctor’s record was not found. It may have been deleted.',
    error: 'Could not load the doctor’s record. Is the server running?',
  };
  return (
    <div className={`${edit.status === 'ready' ? 'bg-mint' : 'bg-rose-50'} mx-4 mt-4 rounded-2xl border border-line sm:mx-6 lg:mx-8`}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <ShieldCheck className="h-4 w-4 shrink-0 text-ink" />
          {edit.status === 'ready' ? (
            <span>
              <strong>Admin editing: {nameOf(edit.record.doctorName)}.</strong> Change any field, then press{' '}
              <strong>Save to record</strong>.
            </span>
          ) : (
            <span className="font-medium">{messages[edit.status]}</span>
          )}
        </p>
        <a href={ADMIN_PAGE} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink ring-1 ring-line hover:ring-ink/40">
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </a>
      </div>
    </div>
  );
}

/**
 * App.jsx
 * Layout: controls as four numbered steps on the left, the portrait on a dark
 * stage on the right (sticky on large screens, first on phones).
 * With ?edit=<record id> it becomes the admin's editor for that doctor: every field is
 * loaded from their latest portrait and "Save to record" stores the new version.
 */
export default function App({ account }) {
  const [activeShade, setActiveShade] = useState(EYE_SHADES.find((sh) => sh.id === 'blue'));
  const [shadeIntensity, setShadeIntensity] = useState(0.78);
  // Both are required before the portrait can be downloaded; they start empty
  const [doctorName, setDoctorName] = useState('');
  const [clinicSubtitle, setClinicSubtitle] = useState('');
  const [uploadedImage, setUploadedImage] = useState(SAMPLE_PHOTO);
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [isProcessing, setIsProcessing] = useState(false);
  const [frameStyle, setFrameStyle] = useState(DEFAULT_FRAME_STYLE);

  // Admin editing mode: load the doctor's record and fill every field from their latest portrait
  const [edit, setEdit] = useState(EDIT_ID ? { status: 'loading' } : null);
  useEffect(() => {
    if (!EDIT_ID) return;
    setEditTarget(EDIT_ID); // from now on, photos and portraits are saved to this record only
    (async () => {
      const res = await loadRecordForEdit(EDIT_ID);
      if (!res.ok) {
        setEdit({ status: res.status === 401 ? 'signin' : res.status === 404 ? 'missing' : 'error' });
        return;
      }
      const rec = res.record;
      const last = rec.downloads[rec.downloads.length - 1];
      const latestPhoto = rec.photos[rec.photos.length - 1];
      // The photo of the latest portrait, unless a newer photo was uploaded after it
      const newerPhoto = latestPhoto && (!last || latestPhoto.uploadedAt > last.downloadedAt);
      const photoFile = newerPhoto ? latestPhoto.file : last?.photoFile || latestPhoto?.file;
      if (photoFile) setUploadedImage(adminPhotoUrl(photoFile));
      setDoctorName(rec.doctorName || '');
      if (last) setClinicSubtitle(rec.caption || '');
      const shade = EYE_SHADES.find((s) => s.id === last?.shadeId);
      if (shade) setActiveShade(shade);
      if (FRAME_DESIGNS.some((d) => d.key === last?.frame)) setFrameStyle(last.frame);
      if (last?.settings?.shadeIntensity) setShadeIntensity(last.settings.shadeIntensity);
      if (last?.settings?.adjust) setAdjust({ ...DEFAULT_ADJUST, ...last.settings.adjust });
      setEdit({ status: 'ready', record: rec });
    })();
  }, []);

  // The editor pop-up. isNew: a freshly uploaded photo that is not applied until the user presses Apply.
  const [editor, setEditor] = useState(null);
  // Every new photo (upload or camera) is checked first: one clear face, eyes open and visible,
  // good light and focus. Only a photo that passes goes on to the editor.
  const [photoCheck, setPhotoCheck] = useState(null); // null | { status: 'checking' } | { status: 'failed', problems, unavailable, src }
  const checkRun = useRef(0);
  const handleImageUpload = async (src) => {
    const run = ++checkRun.current;
    setPhotoCheck({ status: 'checking' });
    const result = await checkPhoto(src);
    if (run !== checkRun.current) return; // a newer photo was chosen meanwhile
    if (result.ok) {
      setPhotoCheck(null);
      setEditor({ src, initial: DEFAULT_ADJUST, isNew: true });
    } else {
      setPhotoCheck({ status: 'failed', problems: result.problems, unavailable: Boolean(result.unavailable), src });
    }
  };
  // Only offered when the checker itself could not run (e.g. no internet)
  const useUncheckedPhoto = () => {
    const src = photoCheck?.src;
    setPhotoCheck(null);
    if (src) setEditor({ src, initial: DEFAULT_ADJUST, isNew: true });
  };

  // Name and caption are required
  const missing = [!doctorName.trim() && 'doctor’s name', !clinicSubtitle.trim() && 'caption'].filter(Boolean);
  const [showRequired, setShowRequired] = useState(false); // after a blocked download, mark the empty fields
  const openAdjust = () => setEditor({ src: uploadedImage, initial: adjust, isNew: false });
  const applyEditor = (next) => {
    if (editor.isNew) {
      setUploadedImage(editor.src);
      touch('photo');
      // keep a copy for the event (storage/1.photo); while the admin edits, it goes to that doctor's record
      if (!edit || edit.status === 'ready') savePhoto(editor.src);
    }
    setAdjust(next);
    setEditor(null);
  };

  const canvasRef = useRef(null);

  // Which steps the user has worked on, for the "done" tags (all done while the admin edits)
  const [touched, setTouched] = useState({});
  const touch = (k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const done = (k) => Boolean(edit?.status === 'ready' || touched[k]);
  const frameLabel = FRAME_DESIGNS.find((d) => d.key === frameStyle)?.label || '';
  // Changes whenever the portrait changes; the header's heartbeat line pulses on each change
  const pulse = `${uploadedImage.length}-${activeShade?.id}-${frameStyle}-${Math.round(shadeIntensity * 10)}`;

  return (
    <div className="studio-bg min-h-screen overflow-x-clip bg-paper">
      <Header account={account} pulse={pulse} />
      {edit && <EditBanner edit={edit} />}

      {editor && (
        <PhotoEditor
          key={editor.src + (editor.isNew ? '-new' : '-edit')}
          src={editor.src}
          initial={editor.initial}
          onApply={applyEditor}
          onCancel={() => setEditor(null)}
        />
      )}

      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pt-10">
        {/* Stage: portrait and export. First on phones, right column on desktop. */}
        <section aria-label="Portrait preview" className="lg:order-2">
          <div className="settle relative rounded-[28px] bg-stage p-3 pt-6 shadow-[0_30px_60px_-30px_rgba(11,35,38,0.6)] sm:p-5 sm:pt-7 lg:sticky lg:top-6">
            <span aria-hidden className="stage-ruler pointer-events-none absolute inset-x-5 top-2.5 h-2 sm:inset-x-6" />
            <CanvasPreview
              canvasRef={canvasRef}
              uploadedImage={uploadedImage}
              adjust={adjust}
              frameStyle={frameStyle}
              activeShade={activeShade}
              shadeIntensity={shadeIntensity}
              doctorName={doctorName}
              clinicSubtitle={clinicSubtitle}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
            />
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Vital label="Status" value={isProcessing ? 'Checking…' : '♥ Healthy'} accent={!isProcessing} />
              <Vital label="Eye colour" value={activeShade?.name} />
              <Vital label="Strength" value={`${Math.round(shadeIntensity * 100)}%`} />
              <Vital label="Frame" value={frameLabel} />
            </dl>
            <ExportButton
              canvasRef={canvasRef}
              doctorName={doctorName}
              clinicSubtitle={clinicSubtitle}
              activeShade={activeShade}
              frameStyle={frameStyle}
              shadeIntensity={shadeIntensity}
              adjust={adjust}
              editing={edit ? { ready: edit.status === 'ready', name: nameOf(edit.record?.doctorName) } : null}
              isProcessing={isProcessing}
              missing={missing}
              onBlocked={() => {
                setShowRequired(true);
                document.getElementById(doctorName.trim() ? 'doctor-subtitle' : 'doctor-name')?.focus();
              }}
            />
          </div>
        </section>

        {/* Controls */}
        <div className="lg:order-1">
          <div className="fx-rise mb-6 max-w-md" style={{ '--d': '0.1s' }}>
            <p className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
              {edit ? 'Chart review' : 'Doctor’s orders'}
            </p>
            <h1 className="font-display text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-[2.75rem]">
              {edit ? (
                <>
                  Edit the doctor’s <em className="font-semibold text-teal">portrait.</em>
                </>
              ) : (
                <>
                  Take one portrait. <em className="font-semibold text-teal">Stat.</em>
                </>
              )}
            </h1>
            <p className="mt-3 text-[15px] font-medium leading-relaxed text-ink-soft">
              {edit
                ? 'Every field below can be changed: photo, eye colour, strength, name, caption and frame. Press Save to record when done.'
                : 'Four quick steps, no appointment needed. Try a new eye colour on the doctor’s photo for World Sight Day. Side effects may include compliments.'}
            </p>
          </div>

          <Checkup done={[done('photo'), done('shade'), missing.length === 0, done('frame')]} />

          <div className="relative">
            <FlowWave />
          <ol className="relative space-y-10 pt-6">
            <Step n={1} title="The photo" done={done('photo')}>
              <PhotoUploader
                uploadedImage={uploadedImage}
                onImageUpload={handleImageUpload}
                isProcessing={isProcessing}
                check={photoCheck}
                onUseAnyway={useUncheckedPhoto}
                onDismissCheck={() => setPhotoCheck(null)}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium text-ink-faint">
                  {isDefaultAdjust(adjust) ? 'No adjustments yet' : 'Brightness or crop adjusted'}
                </p>
                <button
                  type="button"
                  onClick={openAdjust}
                  className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-[13px] font-bold text-teal transition-colors hover:text-ink"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Adjust photo
                </button>
              </div>
            </Step>

            <Step n={2} title="Eye colour" done={done('shade')}>
              <ShadeSelector
                activeShade={activeShade}
                onSelectShade={(sh) => {
                  setActiveShade(sh);
                  touch('shade');
                }}
                shadeIntensity={shadeIntensity}
                onIntensityChange={(v) => {
                  setShadeIntensity(v);
                  touch('shade');
                }}
              />
            </Step>

            <Step n={3} title="Name & caption" done={missing.length === 0}>
              <DoctorInput
                showRequired={showRequired}
                doctorName={doctorName}
                onDoctorNameChange={(v) => {
                  setDoctorName(v);
                  touch('name');
                }}
                clinicSubtitle={clinicSubtitle}
                onClinicSubtitleChange={(v) => {
                  setClinicSubtitle(v);
                  touch('name');
                }}
              />
            </Step>

            <Step n={4} title="Frame" done={done('frame')}>
              <FramePicker
                value={frameStyle}
                onChange={(f) => {
                  setFrameStyle(f);
                  touch('frame');
                }}
              />
            </Step>
          </ol>
          </div>
        </div>
      </main>
    </div>
  );
}

// Each step has its own colour, like colour-coded file tabs. --accent / --tint are used by
// the card and by the controls inside it (slider fill, focus rings, the chosen frame).
const STEPS = {
  1: { icon: Camera, accent: '#0E5E5E', tint: '#DDEFEC' },
  2: { icon: Eye, accent: '#1F78AD', tint: '#DCEEF8' },
  3: { icon: PenLine, accent: '#D9482A', tint: '#FFE3DA' },
  4: { icon: Frame, accent: '#6B4FBB', tint: '#ECE6FA' },
};

const CHECKUP_NOTES = [
  'Ready when you are.',
  'Good start. Keep going.',
  'Halfway there. Vitals look great.',
  'Almost ready for discharge.',
  'All clear! Ready to download.',
];

/** "Checkup progress": one segment per step, filled in the step's colour once it is done. */
function Checkup({ done }) {
  const count = done.filter(Boolean).length;
  return (
    <div className="fx-rise mb-2 rounded-2xl border-[1.5px] border-line bg-card/80 px-4 py-3 backdrop-blur-sm" style={{ '--d': '0.16s' }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Checkup progress</p>
        <p className="font-mono text-[12px] font-bold tabular-nums text-ink">
          {count}/4
        </p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((n, i) => (
          <span key={n} className="h-2 overflow-hidden rounded-full bg-line/70">
            <span
              className="block h-full origin-left rounded-full transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
              style={{ background: STEPS[n].accent, transform: `scaleX(${done[i] ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>
      <p key={count} className="fx-note mt-2 text-[13px] font-semibold text-ink" aria-live="polite">
        {count === 4 ? '🎉 ' : ''}
        {CHECKUP_NOTES[count]}
      </p>
    </div>
  );
}

/** A step as a patient-file card: coloured numbered tab, icon, "done" tag once it has been worked on. */
function Step({ n, title, done, children }) {
  const { icon: Icon, accent, tint } = STEPS[n];
  return (
    <li className="step-card fx-rise group relative" style={{ '--d': `${0.12 + n * 0.08}s`, '--accent': accent, '--tint': tint }}>
      <span
        aria-hidden
        className="absolute -top-[22px] left-0 inline-flex items-center gap-1 rounded-t-lg px-3 pb-[3px] pt-1 font-mono text-[11px] font-bold tracking-[0.1em] text-white transition-colors"
        style={{ background: accent }}
      >
        {String(n).padStart(2, '0')}
        {done && <Check className="fx-tag h-3 w-3" strokeWidth={3.5} />}
      </span>
      <div className="step-body relative overflow-hidden rounded-[20px] rounded-tl-md border-[1.5px] border-line bg-card/[0.8] px-4 pb-5 pt-4 backdrop-blur-[3px] transition-[transform,box-shadow,border-color] duration-300 sm:px-5">
        {/* soft colour wash in the corner */}
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-60 blur-2xl" style={{ background: tint }} />
        <div className="relative mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="step-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint, color: accent }}>
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <h2 className="font-display text-[1.4rem] font-semibold leading-7">
              <span className="sr-only">Step {n}: </span>
              {title}
            </h2>
          </div>
          {done && (
            <span className="fx-tag inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold" style={{ background: tint, color: accent }}>
              <Check className="h-3 w-3" strokeWidth={3} /> done
            </span>
          )}
        </div>
        <div className="relative">{children}</div>
      </div>
    </li>
  );
}

/**
 * One wave in the stage colours running behind the form, from step 1 down to step 4.
 * It swings out past the cards on both sides, so it shows at the edges and in the gaps;
 * a coral pulse travels along it in the 1 -> 4 direction.
 */
const WAVE_D = 'M4 0 C4 120, 96 130, 96 250 S4 380, 4 500 S96 630, 96 750 S4 880, 40 1000';
function FlowWave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -left-3 -right-3 top-4 h-[calc(100%-4.5rem)] w-[calc(100%+1.5rem)] sm:-left-6 sm:-right-6 sm:w-[calc(100%+3rem)] lg:-left-16 lg:-right-10 lg:w-[calc(100%+6.5rem)]"
    >
      <defs>
        <linearGradient id="flow-wave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0E5E5E" />
          <stop offset="55%" stopColor="#143A3E" />
          <stop offset="100%" stopColor="#0B2326" />
        </linearGradient>
      </defs>
      {/* soft shadow under the ribbon */}
      <path d={WAVE_D} fill="none" stroke="#0B2326" strokeOpacity="0.12" strokeWidth="54" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* the ribbon */}
      <path d={WAVE_D} fill="none" stroke="url(#flow-wave)" strokeWidth="40" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* measuring-scale ticks along its centre, like the stage */}
      <path d={WAVE_D} fill="none" stroke="#D3ECE4" strokeOpacity="0.35" strokeWidth="6" strokeDasharray="1 11" vectorEffect="non-scaling-stroke" />
      {/* coral pulse travelling from step 1 to step 4 */}
      <path className="fx-flow" d={WAVE_D} pathLength="1" fill="none" stroke="#FF6B4A" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One readout on the stage's "vitals monitor". */
function Vital({ label, value, accent }) {
  return (
    <div className="min-w-0 rounded-xl border border-mint/20 px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-mint/80">{label}</dt>
      <dd className={`truncate font-display text-[17px] font-semibold ${accent ? 'text-mint-bright' : 'text-white'}`}>{value}</dd>
    </div>
  );
}
