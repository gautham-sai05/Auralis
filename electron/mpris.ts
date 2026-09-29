import type { BrowserWindow } from 'electron';
import electron from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const { app, ipcMain, Notification } = electron;

// Downloads and caches track artwork so it can be used as a notification
// icon. Electron's Notification only accepts a local file path or
// NativeImage for its icon, not a remote URL, so the artwork has to be
// fetched to disk first. Failures here must never break notifications —
// they just show without artwork.
const artworkCacheDir = path.join(app.getPath('userData'), 'artwork-cache');

function fetchArtwork(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(artworkCacheDir, { recursive: true });
      const ext = url.includes('.png') ? 'png' : 'jpg';
      const cachePath = path.join(artworkCacheDir, `${createHash('sha1').update(url).digest('hex')}.${ext}`);
      if (fs.existsSync(cachePath)) {
        resolve(cachePath);
        return;
      }
      const file = fs.createWriteStream(cachePath);
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            file.close();
            fs.unlink(cachePath, () => undefined);
            resolve(undefined);
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(cachePath)));
        })
        .on('error', () => {
          file.close();
          fs.unlink(cachePath, () => undefined);
          resolve(undefined);
        });
    } catch {
      resolve(undefined);
    }
  });
}

interface MediaSessionSnapshot {
  title: string | null;
  artist: string | null;
  album: string | null;
  artwork: string | null;
  playing: boolean;
  position: number;
  duration: number;
}

// Best-effort DOM control: Apple's web player exposes no public control API
// without a MusicKit developer token, so transport controls are relayed by
// invoking the player's own on-page buttons via their accessibility labels.
// This is inherently best-effort and may stop working if Apple changes its
// markup; it degrades silently rather than crashing the app.
const CONTROL_SCRIPTS: Record<string, string> = {
  playPause: `(function(){var a=document.querySelector('audio,video');if(a){a.paused?a.play():a.pause();return;}var b=document.querySelector('[aria-label="Play"],[aria-label="Pause"]');if(b)b.click();})();`,
  next: `(function(){var b=document.querySelector('[aria-label="Next"]');if(b)b.click();})();`,
  previous: `(function(){var b=document.querySelector('[aria-label="Previous"]');if(b)b.click();})();`,
};

export async function setupMpris(win: BrowserWindow): Promise<void> {
  let lastSnapshot: MediaSessionSnapshot | null = null;
  let lastNotifiedTitle: string | null = null;

  const onSnapshot = (_event: unknown, snapshot: MediaSessionSnapshot): void => {
    lastSnapshot = snapshot;
    if (snapshot.title && snapshot.title !== lastNotifiedTitle) {
      lastNotifiedTitle = snapshot.title;
      if (Notification.isSupported()) {
        const show = (icon?: string): void => {
          new Notification({
            title: snapshot.title ?? '',
            body: [snapshot.artist, snapshot.album].filter(Boolean).join(' — '),
            icon,
            silent: true,
          }).show();
        };
        if (snapshot.artwork) {
          void fetchArtwork(snapshot.artwork).then(show);
        } else {
          show();
        }
      }
    }
  };
  ipcMain.on('media-session:snapshot', onSnapshot);

  // dbus-next is optional at runtime: environments without a session D-Bus
  // (minimal containers, some display managers) must still launch the app.
  const dbus = await import('dbus-next');
  const { Interface } = dbus.interface;
  const { Variant } = dbus;

  class Mpris2Root extends Interface {
    get Identity(): string {
      return 'Auralis';
    }
    get DesktopEntry(): string {
      return 'auralis';
    }
    get CanQuit(): boolean {
      return false;
    }
    get CanRaise(): boolean {
      return true;
    }
    get HasTrackList(): boolean {
      return false;
    }
    get SupportedUriSchemes(): string[] {
      return [];
    }
    get SupportedMimeTypes(): string[] {
      return [];
    }
    Raise(): void {
      win.show();
      win.focus();
    }
    Quit(): void {
      // Intentionally a no-op: quitting is user-controlled via the tray menu.
    }
  }
  Mpris2Root.configureMembers({
    properties: {
      Identity: { signature: 's', access: 'read' },
      DesktopEntry: { signature: 's', access: 'read' },
      CanQuit: { signature: 'b', access: 'read' },
      CanRaise: { signature: 'b', access: 'read' },
      HasTrackList: { signature: 'b', access: 'read' },
      SupportedUriSchemes: { signature: 'as', access: 'read' },
      SupportedMimeTypes: { signature: 'as', access: 'read' },
    },
    methods: {
      Raise: { inSignature: '', outSignature: '' },
      Quit: { inSignature: '', outSignature: '' },
    },
  });

  class Mpris2Player extends Interface {
    get PlaybackStatus(): string {
      if (!lastSnapshot) return 'Stopped';
      return lastSnapshot.playing ? 'Playing' : 'Paused';
    }
    get Metadata(): Record<string, InstanceType<typeof Variant>> {
      const s = lastSnapshot;
      const meta: Record<string, InstanceType<typeof Variant>> = {
        'mpris:trackid': new Variant('o', '/org/auralis/track/current'),
        'mpris:length': new Variant('x', Math.floor((s?.duration ?? 0) * 1_000_000)),
        'xesam:title': new Variant('s', s?.title ?? ''),
        'xesam:artist': new Variant('as', s?.artist ? [s.artist] : []),
        'xesam:album': new Variant('s', s?.album ?? ''),
      };
      if (s?.artwork) {
        meta['mpris:artUrl'] = new Variant('s', s.artwork);
      }
      return meta;
    }
    get CanGoNext(): boolean {
      return true;
    }
    get CanGoPrevious(): boolean {
      return true;
    }
    get CanPlay(): boolean {
      return true;
    }
    get CanPause(): boolean {
      return true;
    }
    get CanSeek(): boolean {
      return false;
    }
    get CanControl(): boolean {
      return true;
    }
    PlayPause(): void {
      void win.webContents.executeJavaScript(CONTROL_SCRIPTS.playPause).catch(() => undefined);
    }
    Play(): void {
      this.PlayPause();
    }
    Pause(): void {
      this.PlayPause();
    }
    Next(): void {
      void win.webContents.executeJavaScript(CONTROL_SCRIPTS.next).catch(() => undefined);
    }
    Previous(): void {
      void win.webContents.executeJavaScript(CONTROL_SCRIPTS.previous).catch(() => undefined);
    }
    Stop(): void {
      this.PlayPause();
    }
  }
  Mpris2Player.configureMembers({
    properties: {
      PlaybackStatus: { signature: 's', access: 'read' },
      Metadata: { signature: 'a{sv}', access: 'read' },
      CanGoNext: { signature: 'b', access: 'read' },
      CanGoPrevious: { signature: 'b', access: 'read' },
      CanPlay: { signature: 'b', access: 'read' },
      CanPause: { signature: 'b', access: 'read' },
      CanSeek: { signature: 'b', access: 'read' },
      CanControl: { signature: 'b', access: 'read' },
    },
    methods: {
      PlayPause: { inSignature: '', outSignature: '' },
      Play: { inSignature: '', outSignature: '' },
      Pause: { inSignature: '', outSignature: '' },
      Next: { inSignature: '', outSignature: '' },
      Previous: { inSignature: '', outSignature: '' },
      Stop: { inSignature: '', outSignature: '' },
    },
  });

  const bus = dbus.sessionBus();
  bus.export('/org/mpris/MediaPlayer2', new Mpris2Root('org.mpris.MediaPlayer2'));
  bus.export('/org/mpris/MediaPlayer2', new Mpris2Player('org.mpris.MediaPlayer2.Player'));
  await bus.requestName('org.mpris.MediaPlayer2.auralis', 0);

  win.on('closed', () => {
    ipcMain.removeListener('media-session:snapshot', onSnapshot);
    try {
      bus.disconnect();
    } catch {
      // Bus may already be gone during shutdown; nothing to do.
    }
  });
}
