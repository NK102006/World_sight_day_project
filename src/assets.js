// Public asset URLs for the studio, which is served from /studio/.
// With the relative build base ('./'), BASE_URL is relative to the current page,
// so step up one folder to reach the site root where public/ files live.
// (In `npm run dev`, BASE_URL is '/', which already points at the root.)
const raw = import.meta.env.BASE_URL;
const base = raw === './' ? '../' : raw;
export const SAMPLE_PHOTO = `${base}sample-doctor.jpg`;
export const FRAME_PNG = `${base}world-sight-day-frame.png`;
