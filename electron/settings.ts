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

const EQUALIZER_PRESETS: readonly EqualizerPreset[] = ['flat', 'bassBoost', 'trebleBoost', 'vocalBoost'];

// Validates each field independently and falls back to its default rather
// than trusting the file wholesale — this runs on both a normal load and on
// a user-provided import, and an import in particular could easily be a
// hand-edited or stale file with the wrong shape. An invalid equalizerPreset
// in particular isn't just cosmetic: player-control.ts looks it up directly
// in a fixed table with no fallback, so an unvalidated bogus value would
// throw when the preset is next applied.
export function sanitizeSettings(input: unknown): Settings {
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<Settings>;
  return {
    notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : DEFAULTS.notificationsEnabled,
    minimizeToTray: typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : DEFAULTS.minimizeToTray,
    hasShownTrayHint: typeof parsed.hasShownTrayHint === 'boolean' ? parsed.hasShownTrayHint : DEFAULTS.hasShownTrayHint,
    hardwareAcceleration: typeof parsed.hardwareAcceleration === 'boolean' ? parsed.hardwareAcceleration : DEFAULTS.hardwareAcceleration,
    equalizerPreset: EQUALIZER_PRESETS.includes(parsed.equalizerPreset as EqualizerPreset)
      ? (parsed.equalizerPreset as EqualizerPreset)
      : DEFAULTS.equalizerPreset,
  };
}

export function loadSettings(userDataDir: string): Settings {
  try {
    const raw = fs.readFileSync(filePath(userDataDir), 'utf-8');
    return sanitizeSettings(JSON.parse(raw));
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
