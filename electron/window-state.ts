import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

interface Bounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const DEFAULTS: Bounds = { width: 1280, height: 800 };

function filePath(userDataDir: string): string {
  return path.join(userDataDir, 'window-state.json');
}

export function loadWindowState(userDataDir: string): Bounds {
  try {
    const raw = fs.readFileSync(filePath(userDataDir), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Bounds>;
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // No saved state yet, or it's corrupt — fall back to defaults silently.
  }
  return DEFAULTS;
}

export function trackWindowState(win: BrowserWindow, userDataDir: string): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const maximized = win.isMaximized();
        const bounds = maximized ? win.getNormalBounds() : win.getBounds();
        const state: Bounds = { ...bounds, maximized };
        fs.writeFileSync(filePath(userDataDir), JSON.stringify(state));
      } catch {
        // Best-effort persistence; a failed write must never crash the app.
      }
    }, 400);
  };

  win.on('resize', save);
  win.on('move', save);
  win.on('close', save);
}
