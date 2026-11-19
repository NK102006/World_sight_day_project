import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // Three pages:
      //   /         landing page (index.html -> src/landing/main.jsx)
      //   /studio/  the portrait studio (studio/index.html -> src/main.jsx)
      //   /admin/   the admin page (admin/index.html -> src/admin/main.jsx), password protected by server/index.mjs
      input: {
        main: page('./index.html'),
        studio: page('./studio/index.html'),
        admin: page('./admin/index.html'),
      },
    },
  },
});
