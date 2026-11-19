// Links and asset paths for the landing page.
// The landing page is the site's front page (/); the studio lives at /studio/.
// Paths are relative so the built dist/ folder also works when hosted in a sub-folder.

/** The studio app. */
export const STUDIO_URL = './studio/';

/** Static files: the app's own public/ folder plus public/landing-assets/. */
export const asset = (path) => `./${path}`;
