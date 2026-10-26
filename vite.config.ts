import { defineConfig } from 'vitest/config';

// Relative base so the same build works at any GitHub Pages path.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
