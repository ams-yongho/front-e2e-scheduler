'use strict';

const assert = require('assert');
const { transformSpecSource } = require('../run-find-parts-staging-e2e');

const input = `
await page.context().addCookies([
  { name: 'accessToken', value: 'mock-access-token', domain: 'localhost', path: '/' },
  { name: 'refreshToken', value: 'mock-refresh-token', domain: 'localhost', path: '/' },
]);
await page.goto('/product');
await page.waitForURL('**/product', { timeout: 15000 });
`;

const output = transformSpecSource(input);

assert(output.includes("url: process.env.PLAYWRIGHT_BASE_URL || 'https://fp-staging.amass.co.kr'"));
assert(output.includes("await page.goto('/product', { waitUntil: 'domcontentloaded' });"));
assert(output.includes("await page.waitForURL('**/product', { timeout: 15000, waitUntil: 'domcontentloaded' });"));
assert(!output.includes("domain: 'localhost'"));

console.log('✅ run-find-parts-staging-e2e transform');
