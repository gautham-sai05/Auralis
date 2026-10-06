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

export function loadHistory(userDataDir: string): HistoryEntry[] {
  try {
    const raw = fs.readFileSync(filePath(userDataDir), 'utf-8');
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (Array.isArray(parsed)) return parsed;
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
