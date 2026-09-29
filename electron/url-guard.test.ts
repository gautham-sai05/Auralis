import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedUrl } from './url-guard.js';

test('allows the Apple Music storefront', () => {
  assert.equal(isAllowedUrl('https://music.apple.com/us/browse'), true);
});

test('allows Apple sign-in domains', () => {
  assert.equal(isAllowedUrl('https://idmsa.apple.com/appleauth/auth'), true);
  assert.equal(isAllowedUrl('https://appleid.apple.com/auth'), true);
});

test('rejects unrelated domains', () => {
  assert.equal(isAllowedUrl('https://evil.example.com/'), false);
});

test('rejects non-https schemes even on an allowed host', () => {
  assert.equal(isAllowedUrl('http://music.apple.com/'), false);
  assert.equal(isAllowedUrl('file:///etc/passwd'), false);
});

test('rejects malformed urls without throwing', () => {
  assert.equal(isAllowedUrl('not a url'), false);
});
