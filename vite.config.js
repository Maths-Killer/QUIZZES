import { defineConfig } from 'vite';

// GitHub Pages serves project repos at https://<username>.github.io/QUIZZES/,
// not at the domain root — so the production build needs every asset path
// prefixed with /QUIZZES/. Local dev (`npm run dev`) must stay at root,
// otherwise localhost:5173/QUIZZES/ would be required just to open the app.
// `command === 'build'` is true only for `vite build` (what the GitHub
// Actions workflow runs), never for `vite` (dev server) or `vite preview`.
export default defineConfig(({ command }) => ({
  root: '.',
  base: command === 'build' ? '/QUIZZES/' : '/',
  server: {
    host: 'localhost',
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020', // IndexedDB + async/await baseline; no need to transpile further for a local-first SPA
  },
}));
