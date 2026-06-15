'use strict';

const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

const caAdminConfig = require(path.join(
  repoRoot,
  'projects/ca-admin/config.json',
));

assert.strictEqual(
  caAdminConfig.e2e_command.includes(
    'PLAYWRIGHT_BASE_URL=https://ca-admin-staging.amass.co.kr',
  ),
  true,
  'ca-admin E2E must target the reachable staging host',
);
assert.strictEqual(
  caAdminConfig.e2e_command.includes('-c playwright.staging.config.ts'),
  true,
  'ca-admin E2E must use the staging Playwright config',
);
assert.strictEqual(
  caAdminConfig.e2e_command.includes('--reporter=json'),
  true,
  'ca-admin E2E must emit JSON to stdout for scheduler parsing',
);

console.log('✅ project configs');
