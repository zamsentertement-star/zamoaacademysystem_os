import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function pgBrowserSafePlugin(): Plugin {
  const virtualPgId = '\0virtual:pg-browser-stub';
  return {
    name: 'pg-browser-safe-stub',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      if (id === 'pg' && !options?.ssr) {
        return virtualPgId;
      }
      return null;
    },
    load(id) {
      if (id === virtualPgId) {
        return `
          export class Pool {
            constructor(config) { this.config = config || {}; }
            on() { return this; }
            async query() { return { rows: [], rowCount: 0 }; }
            async connect() {
              return {
                query: async () => ({ rows: [], rowCount: 0 }),
                release: () => {},
              };
            }
            async end() {}
          }
          export default { Pool };
        `;
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [pgBrowserSafePlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
