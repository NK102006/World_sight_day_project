/** @type {import('tailwindcss').Config} */
// Colour tokens are shared by the landing page, the studio and the admin page.
// "gold" is kept as the token name for the accent (now coral) so every page picks it up.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F0E6',
        card: '#FFFDF8',
        ink: { DEFAULT: '#0F2A2E', soft: '#4F6466', faint: '#8A9B9B' },
        line: '#DCD5C4',
        stage: { DEFAULT: '#0B2326', raised: '#143A3E', line: '#24484C' },
        gold: { DEFAULT: '#FF6B4A', deep: '#E2502F', tint: '#FFE3DA' },
        teal: { DEFAULT: '#0E5E5E', soft: '#1F7A78' },
        mint: { DEFAULT: '#D3ECE4', bright: '#7CF0C4' },
      },
      fontFamily: {
        // Landing page (unchanged fonts)
        slab: ['"Zilla Slab"', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        // Studio and admin
        display: ['Fraunces', 'Georgia', 'serif'],
        ui: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
