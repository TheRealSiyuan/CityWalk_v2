import { defineConfig } from '@playwright/test';

const RELAY_PORT = 7447;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      // software WebGL so the tests run on machines without a GPU
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run relay', port: RELAY_PORT, reuseExistingServer: true, timeout: 20_000, env: { RELAY_PORT: String(RELAY_PORT) } },
  ],
});
