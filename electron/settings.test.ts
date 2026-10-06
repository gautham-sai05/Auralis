import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSettings } from './settings.js';

test('fills in defaults for missing fields', () => {
  const result = sanitizeSettings({});
  assert.equal(result.notificationsEnabled, true);
  assert.equal(result.equalizerPreset, 'flat');
});

test('accepts a fully valid settings object unchanged', () => {
  const input = {
    notificationsEnabled: false,
    minimizeToTray: true,
    hasShownTrayHint: true,
    hardwareAcceleration: true,
    equalizerPreset: 'bassBoost',
  };
  assert.deepEqual(sanitizeSettings(input), input);
});

test('falls back to the default equalizer preset for an unknown value', () => {
  // This is the exact case that would otherwise crash player-control.ts:
  // it looks up the preset directly in a fixed table with no fallback.
  const result = sanitizeSettings({ equalizerPreset: 'megaBass' });
  assert.equal(result.equalizerPreset, 'flat');
});

test('falls back to defaults for wrong-typed boolean fields', () => {
  const result = sanitizeSettings({ notificationsEnabled: 'yes', minimizeToTray: 1 });
  assert.equal(result.notificationsEnabled, true);
  assert.equal(result.minimizeToTray, false);
});

test('never throws on garbage input', () => {
  assert.doesNotThrow(() => sanitizeSettings(null));
  assert.doesNotThrow(() => sanitizeSettings(undefined));
  assert.doesNotThrow(() => sanitizeSettings('not an object'));
  assert.doesNotThrow(() => sanitizeSettings(42));
  assert.doesNotThrow(() => sanitizeSettings([1, 2, 3]));
});
