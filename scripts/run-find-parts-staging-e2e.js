#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_BASE_URL = 'https://fp-staging.amass.co.kr';

function transformSpecSource(source) {
  return source
    .replace(
      /\{ name: 'accessToken', value: 'mock-access-token', domain: 'localhost', path: '\/' \}/g,
      "{ name: 'accessToken', value: 'mock-access-token', url: process.env.PLAYWRIGHT_BASE_URL || 'https://fp-staging.amass.co.kr' }"
    )
    .replace(
      /\{ name: 'refreshToken', value: 'mock-refresh-token', domain: 'localhost', path: '\/' \}/g,
      "{ name: 'refreshToken', value: 'mock-refresh-token', url: process.env.PLAYWRIGHT_BASE_URL || 'https://fp-staging.amass.co.kr' }"
    )
    .replace(
      /await page\.goto\(([^,\n;]+)\);/g,
      "await page.goto($1, { waitUntil: 'domcontentloaded' });"
    )
    .replace(
      /await page\.waitForURL\(([^,\n;]+), \{ timeout: ([0-9_]+) \}\);/g,
      "await page.waitForURL($1, { timeout: $2, waitUntil: 'domcontentloaded' });"
    );
}

function walkFiles(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(file, callback);
    } else {
      callback(file);
    }
  }
}

function transformCopiedE2E(dir) {
  walkFiles(dir, file => {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) return;
    const source = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, transformSpecSource(source));
  });
}

function createConfig({ projectRoot, testDir, baseURL }) {
  const playwrightTestPath = require.resolve('@playwright/test', { paths: [projectRoot] });
  return `
const { defineConfig, devices } = require(${JSON.stringify(playwrightTestPath)});

module.exports = defineConfig({
  testDir: ${JSON.stringify(testDir)},
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'blob' : 'html',
  outputDir: ${JSON.stringify(path.join(projectRoot, 'test-results'))},
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || ${JSON.stringify(baseURL)},
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`;
}

function main(argv = process.argv.slice(2)) {
  const projectRoot = process.cwd();
  const sourceE2EDir = path.join(projectRoot, 'e2e');
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL;

  if (!fs.existsSync(sourceE2EDir)) {
    console.error(`[find-parts-staging] e2e directory not found: ${sourceE2EDir}`);
    return 2;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'find-parts-staging-e2e-'));
  const tmpE2EDir = path.join(tmpRoot, 'e2e');
  const tmpConfig = path.join(tmpRoot, 'playwright.config.cjs');

  try {
    fs.cpSync(sourceE2EDir, tmpE2EDir, { recursive: true });
    const nodeModules = path.join(projectRoot, 'node_modules');
    if (fs.existsSync(nodeModules)) {
      fs.symlinkSync(nodeModules, path.join(tmpRoot, 'node_modules'), 'dir');
    }
    transformCopiedE2E(tmpE2EDir);
    fs.writeFileSync(tmpConfig, createConfig({ projectRoot, testDir: tmpE2EDir, baseURL }));

    const child = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', tmpConfig, ...argv], {
      cwd: projectRoot,
      env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
      stdio: 'inherit',
    });

    if (child.error) {
      console.error(child.error);
      return 1;
    }
    return child.status ?? 1;
  } finally {
    if (process.env.KEEP_FIND_PARTS_STAGING_TMP !== '1') {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  createConfig,
  main,
  transformSpecSource,
};
