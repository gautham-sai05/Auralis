import fs from 'node:fs';
import path from 'node:path';

export interface HistoryEntry {
  title: string;
  artist: string | null;
  album: string | null;
  url: string | null;
  playedAt: number;
}

const MAX_ENTRIES = 20;

function filePath(userDataDir: string): string {
  return path.join(userDataDir, 'history.json');
}

// Used for both a normal load and a user-provided import, and validates
// every field rather than trusting the shape — url in particular is passed
// straight to BrowserWindow.loadURL(), which throws synchronously on a
// non-string argument, so a malformed entry (hand-edited or stale) could
// otherwise crash the app the moment it's clicked in "Recently Played".
export function sanitizeHistory(input: unknown): HistoryEntry[] {
  if (!Array.isArray(input)) return [];
  const result: HistoryEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<HistoryEntry>;
    if (typeof entry.title !== 'string') continue;
    result.push({
      title: entry.title,
      artist: typeof entry.artist === 'string' ? entry.artist : null,
      album: typeof entry.album === 'string' ? entry.album : null,
      url: typeof entry.url === 'string' ? entry.url : null,
      playedAt: typeof entry.playedAt === 'number' ? entry.playedAt : Date.now(),
    });
    if (result.length >= MAX_ENTRIES) break;
  }
  return result;
}

export function loadHistory(userDataDir: string): HistoryEntry[] {
  try {
    const raw = fs.readFileSync(filePath(userDataDir), 'utf-8');
    return sanitizeHistory(JSON.parse(raw));
  } catch {
    // No saved history yet, or it's corrupt — start fresh.
  }
  return [];
}

export function saveHistory(userDataDir: string, entries: HistoryEntry[]): void {
  try {
    fs.writeFileSync(filePath(userDataDir), JSON.stringify(entries));
  } catch {
    // Best-effort persistence; a failed write must never crash the app.
  }
}

// Adds to the front, dedupes a track that's just a repeat of the most recent
// one (e.g. the same song looping), and caps the list so it can't grow
// unbounded over a long-running session.
export function addEntry(entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (entries[0]?.title === entry.title && entries[0]?.artist === entry.artist) {
    return entries;
  }
  return [entry, ...entries].slice(0, MAX_ENTRIES);
}
