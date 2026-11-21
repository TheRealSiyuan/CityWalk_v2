import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { OG_IMAGE_FILE, socialMetaTags, wantsSocialMeta } from './src/socialmeta';

// Public address of the default build (GitHub Pages). Only used for link previews.
const PUBLIC_URL = 'https://therealsiyuan.github.io/CityWalk_v2/';

/** Adds link-preview tags and the preview image to the public web build only. */
function socialMeta(): Plugin {
  const on = wantsSocialMeta(process.env);
  return {
    name: 'citywalk-social-meta',
    apply: 'build',
    transformIndexHtml(html) {
      if (!on) return html;
      const tags = socialMetaTags({
        baseUrl: PUBLIC_URL,
        title: 'CityWalk — swing through London',
        description: 'Walk, run, jump and swing across a storybook London. Free in your browser, with friends.',
      });
      return html.replace('</title>', `</title>\n    ${tags}`);
    },
    generateBundle() {
      if (!on) return;
      this.emitFile({ type: 'asset', fileName: OG_IMAGE_FILE, source: readFileSync('marketing/og-1200x630.jpg') });
    },
  };
}

// Relative base so the same build works at any GitHub Pages path.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  base: './',
  plugins: [socialMeta()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
