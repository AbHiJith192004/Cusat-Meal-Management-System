import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Whose deployment this is. One word drives every visible name, in the page
 * title and metadata here and through src/brand.ts in the app itself.
 *
 * The default matters: Vite's own %VAR% substitution leaves the literal
 * "%VITE_ORG_NAME%" in index.html when the variable is unset, so a plain
 * `npm run build` would ship a page titled "%VITE_ORG_NAME% MessConnect".
 * Substituting here with a fallback means an unset environment produces
 * exactly the strings the app has always shown.
 */
const ORG = process.env.VITE_ORG_NAME?.trim() || 'CUSAT';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'messconnect-brand-html',
        transformIndexHtml: (html: string) => html.split('%VITE_ORG_NAME%').join(ORG),
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
