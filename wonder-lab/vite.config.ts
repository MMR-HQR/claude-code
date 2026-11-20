/// <reference types="vitest" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// Strict CSP for production builds: the app talks to nobody. (Dev server needs inline scripts.)
const CSP = "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'";
const cspPlugin: PluginOption = {
  name: 'wonder-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

const plugins: PluginOption[] = [
  react(),
  cspPlugin,
  VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    // Service worker precaches ONLY the static app shell. No runtime caching of
    // media or any other request: private recordings live in IndexedDB only.
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      runtimeCaching: [],
      navigateFallback: 'index.html',
    },
    manifest: {
      name: 'Wonder Lab',
      short_name: 'Wonder Lab',
      description: 'A place to wonder. A lifetime to remember.',
      theme_color: '#1d1b3a',
      background_color: '#fbf6ec',
      display: 'standalone',
      orientation: 'any',
      start_url: './',
      scope: './',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
  }),
];
// LAN testing on a real iPad needs a secure context (getUserMedia + crypto.subtle).
if (process.env.WONDER_HTTPS === '1') plugins.push(basicSsl());

export default defineConfig({
  base: './',
  plugins,
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/**/*.dom.test.tsx', 'jsdom']],
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
  },
});
