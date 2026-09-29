import type { BrowserWindow } from 'electron';
import electron from 'electron';

const { ipcMain, Notification } = electron;

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
        new Notification({
          title: snapshot.title,
          body: [snapshot.artist, snapshot.album].filter(Boolean).join(' — '),
          silent: true,
        }).show();
      }
    }
  };
  ipcMain.on('media-session:snapshot', onSnapshot);

  // dbus-next is optional at runtime: environments without a session D-Bus
  // (minimal containers, some display managers) must still launch the app.
  const dbus = await import('dbus-next');
  const { Interface, method, property } = dbus.interface;
  const { Variant } = dbus;

  // dbus-next's method() returns a standard TS MethodDecorator, which
  // requires a PropertyDescriptor as its third argument; applied manually
  // (outside a `@method(...)` class-decorator position) we fetch it ourselves.
  function applyMethod(opts: Parameters<typeof method>[0], proto: object, key: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor) throw new Error(`method ${key} not found on prototype`);
    method(opts)(proto, key, descriptor);
  }

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
  property({ signature: 's' })(Mpris2Root.prototype, 'Identity');
  property({ signature: 's' })(Mpris2Root.prototype, 'DesktopEntry');
  property({ signature: 'b' })(Mpris2Root.prototype, 'CanQuit');
  property({ signature: 'b' })(Mpris2Root.prototype, 'CanRaise');
  property({ signature: 'b' })(Mpris2Root.prototype, 'HasTrackList');
  property({ signature: 'as' })(Mpris2Root.prototype, 'SupportedUriSchemes');
  property({ signature: 'as' })(Mpris2Root.prototype, 'SupportedMimeTypes');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Root.prototype, 'Raise');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Root.prototype, 'Quit');

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
  property({ signature: 's' })(Mpris2Player.prototype, 'PlaybackStatus');
  property({ signature: 'a{sv}' })(Mpris2Player.prototype, 'Metadata');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanGoNext');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanGoPrevious');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanPlay');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanPause');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanSeek');
  property({ signature: 'b' })(Mpris2Player.prototype, 'CanControl');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'PlayPause');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'Play');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'Pause');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'Next');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'Previous');
  applyMethod({ inSignature: '', outSignature: '' }, Mpris2Player.prototype, 'Stop');

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
