import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  notificationsEnabled: boolean;
  minimizeToTray: boolean;
  hasShownTrayHint: boolean;
}

const DEFAULTS: Settings = {
  notificationsEnabled: true,
  minimizeToTray: false,
  hasShownTrayHint: false,
};

function filePath(userDataDir: string): string {
  return path.join(userDataDir, 'settings.json');
}

export function loadSettings(userDataDir: string): Settings {
  try {
    const raw = fs.readFileSync(filePath(userDataDir), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // No saved settings yet, or the file is corrupt — fall back to defaults.
    return { ...DEFAULTS };
  }
}

export function saveSettings(userDataDir: string, settings: Settings): void {
  try {
    fs.writeFileSync(filePath(userDataDir), JSON.stringify(settings));
  } catch {
    // Best-effort persistence; a failed write must never crash the app.
  }
}
