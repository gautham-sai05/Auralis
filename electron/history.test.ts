import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEntry, sanitizeHistory } from './history.js';

test('rejects non-array input without throwing', () => {
  assert.deepEqual(sanitizeHistory(null), []);
  assert.deepEqual(sanitizeHistory({ title: 'not an array' }), []);
  assert.deepEqual(sanitizeHistory(42), []);
});

test('drops entries without a string title', () => {
  const result = sanitizeHistory([{ artist: 'Someone', url: 'https://music.apple.com/x' }, { title: 'Real Song' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Real Song');
});

test('coerces a non-string url to null rather than passing it through', () => {
  // A non-string url would otherwise reach BrowserWindow.loadURL(), which
  // throws synchronously on a non-string argument when the entry is clicked.
  const result = sanitizeHistory([{ title: 'Song', url: 12345 }]);
  assert.equal(result[0].url, null);
});

test('caps the list at 20 entries', () => {
  const input = Array.from({ length: 30 }, (_, i) => ({ title: `Song ${i}` }));
  const result = sanitizeHistory(input);
  assert.equal(result.length, 20);
});

test('addEntry dedupes an immediate repeat of the same track', () => {
  const entries = [{ title: 'A', artist: 'X', album: null, url: null, playedAt: 1 }];
  const result = addEntry(entries, { title: 'A', artist: 'X', album: null, url: null, playedAt: 2 });
  assert.equal(result.length, 1);
});

test('addEntry adds a genuinely new track to the front', () => {
  const entries = [{ title: 'A', artist: 'X', album: null, url: null, playedAt: 1 }];
  const result = addEntry(entries, { title: 'B', artist: 'Y', album: null, url: null, playedAt: 2 });
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'B');
});
