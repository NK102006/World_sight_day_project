# Eye Shade Studio — "See Yourself in a New Shade"

A component-driven React web application built for **World Sight Day** doctor engagement. Doctors can upload or capture their photograph, virtually experiment with eight natural eye shades (Light Blue, Blue, Grey, Green, Hazel, Amber, Brown, Dark Brown), and generate an instant personalized World Sight Day portrait featuring their name (`Dr. [Doctor's Name]`) ready for printing and gifting or digital sharing.

## Pages

| Address | Page | Files |
| --- | --- | --- |
| `/` | Landing page (what visitors see first) | `index.html` → `src/landing/` |
| `/studio/` | The portrait studio (users sign in first) | `studio/index.html` → `src/main.jsx` → `src/StudioGate.jsx` |
| `/admin/` | Admin: users, their doctors, photos and portraits (password protected) | `admin/index.html` → `src/admin/` |

### Users and sign-in (admin → users → doctors)

- The **admin** (password in `.env`) creates **users** on the admin page with **Add user**: a name,
  a username and a password. The pop-up then shows the details to give the user.
- A **user** signs in at `/studio/`. Every doctor they make there is saved under their account.
  **New doctor** in the studio header starts the next doctor. **Sign out** ends the session.
- After the admin signs in, the admin page lists every user. Clicking a user opens a page
  with only that user's doctors (address `/admin/#user=<id>`; the browser's Back button returns
  to the list). Each user card has:
  - an **Active / Inactive** switch (inactive users are signed out and can't sign in);
  - **Edit** (change the name or set a new password, which signs the user out);
  - **Delete** (the user's doctors are kept and move to **No user**).
- A doctor's details pop-up has a **User** picker for moving the doctor to another user.
- Doctors saved before sign-in existed appear under **No user**.
- The admin's **Edit in studio** doesn't need a user sign-in.
- Studio sign-ins last 7 days. Passwords are stored only as scrypt hashes, in the `users` table of `storage/doctors.db`.

Every **Make your portrait** button on the landing page opens `/studio/`. Share the main address
for the full experience, or `/studio/` to send people straight to the studio.

## Running it

Needs Node.js 22.13 or newer (for the built-in SQLite module). The site runs on a small Node server (`server/index.mjs`) that also
stores the doctors' photos and portraits.

1. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD` (the `/admin/` page stays locked without it).
2. Then:

```bash
npm install
npm run dev       # development: http://localhost:5173/  (/studio/, /admin/)
npm run build     # production build into dist/
npm start         # production: serves dist/ + the API on http://localhost:3000/
```

Deploy to a host that runs Node (not a static-only host), with `npm run build && npm start`.
`npm run preview` still serves the built files, but without saving anything.

## Stored data (admin)

Everything a doctor does in the studio is saved on the server, in `storage/`:

| Folder / file | What is in it |
| --- | --- |
| `storage/1.photo/` | Every photo a doctor uploads (saved when they press **Apply** in the photo editor) |
| `storage/2.Downloaded Image/` | Every portrait a doctor downloads (the same 1000 × 1000 PNG they receive) |
| `storage/doctors.db` | SQLite database (`server/db.mjs`): tables `users`, `user_sessions`, `doctors` (each with its `user_id`), `photos`, `downloads` with name, caption, shade and frame of each download, dates, file names |

The database uses Node's built-in `node:sqlite`, so there is nothing extra to install. Open
`doctors.db` with any SQLite tool (for example DB Browser for SQLite) to query it directly.
To back up, stop the server and copy the whole `storage/` folder (the database and both image
folders belong together). Records from the earlier `doctors.json` version are imported
automatically on first start.

Open `/admin/` (user `admin`, the password from `.env`) to see every doctor with their uploaded
photos and downloaded portraits, browse the two folders, search, preview and download files,
export everything as a CSV spreadsheet, or delete a record (and its files).
The studio and landing page tell visitors that photos are saved for the event.
`storage/` and `.env` are in `.gitignore`: they hold personal data and the password.

The landing page is a single screen: the sample portrait inside a large eye, the studio's
8 shades arched above it and its 5 frames curved below it (`src/landing/components/EyeStage.jsx`).
It cycles through the shades on its own; every shade, frame and button opens the studio.
It reuses the studio's shade and frame data; its images live in `public/landing-assets/`
(`eye/<shade>.jpg`: the sample portrait recoloured per shade; `frames/<frame>.jpg`: studio renders).

## Component Architecture

- `src/App.jsx` — Main container managing global state (`activeShade`, `doctorName`, `uploadedImage`, `shadeIntensity`, and `isProcessing`).
- `src/components/Header.jsx` — Displays the project title **"Eye Shade Studio"** and tagline **"See Yourself in a New Shade"**.
- `src/components/PhotoUploader.jsx` — File input component using `FileReader` to load the doctor's photograph into memory.
- `src/components/ShadeSelector.jsx` — Shade cards with iris illustrations (eight natural colours: Light Blue, Blue, Grey, Green, Hazel, Amber, Brown, Dark Brown) and blend strength.
- `src/components/DoctorInput.jsx` — Captures the Doctor's Name and optional tagline for real-time personalization.
- `src/components/CanvasPreview.jsx` — Canvas preview, World Sight Day frame, detection pipeline orchestration, iris shade renderer (visible iris = circle ∩ eyelid polygon, feathered), click/drag eye correction and 4x loupes.
- `src/services/faceLandmarks.js` — MediaPipe **FaceLandmarker** (Tasks Vision, loaded from CDN as an ES module). Runs on the *full* photo and returns iris centre/radius plus a smoothed eyelid ring for each eye.
- `src/services/irisFit.js` — Pure, DOM-free sub-pixel iris circle fit (constrained Daugman-style search on the left/right limbus arcs, eyelid-aware, with a landmark prior), plus eyelid-polygon helpers.
- `src/services/mediapipeDetector.js` — Landmark index constants and a last-resort heuristic eye finder (assumes dark irises; flagged low-confidence in the UI).

### Offline use
Copy `face_landmarker.task` and the `tasks-vision/wasm` folder into `public/` and point `MODEL_URL` / `WASM_URL` / `BUNDLE_URL` in `faceLandmarks.js` at them.

- `src/components/ExportButton.jsxx` — Downloads the finalized 1000×1000 composite PNG.
