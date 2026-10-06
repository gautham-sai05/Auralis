import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  notificationsEnabled: boolean;
  minimizeToTray: boolean;
  hasShownTrayHint: boolean;
  hardwareAcceleration: boolean;
  equalizerPreset: EqualizerPreset;
}

export type EqualizerPreset = 'flat' | 'bassBoost' | 'trebleBoost' | 'vocalBoost';

const DEFAULTS: Settings = {
  notificationsEnabled: true,
  minimizeToTray: false,
  hasShownTrayHint: false,
  // Off by default: this is the fix for a real GPU crash loop observed on
  // this Wayland/Mesa setup (see main.ts), but that bug is specific to this
  // kind of driver/compositor combination, not universal. Defaulting to the
  // safe, verified-working state and letting capable hardware opt back into
  // GPU compositing (a real performance win there) is better than forcing
  // every user onto software rendering regardless of their actual hardware.
  hardwareAcceleration: false,
  equalizerPreset: 'flat',
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
