import { contextBridge, ipcRenderer } from 'electron';

// Minimal, read-only bridge. No Node or Electron internals are exposed to
// Apple's remote web content beyond this explicit, narrow surface.
contextBridge.exposeInMainWorld('auralis', {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  onMediaSessionUpdate: (callback: (data: MediaSessionSnapshot) => void): (() => void) => {
    const handler = (_event: unknown, data: MediaSessionSnapshot): void => callback(data);
    ipcRenderer.on('media-session:update', handler);
    return () => ipcRenderer.removeListener('media-session:update', handler);
  },
});

interface MediaSessionSnapshot {
  title: string | null;
  artist: string | null;
  album: string | null;
  artwork: string | null;
  playing: boolean;
  position: number;
  duration: number;
}

// Poll the page's Media Session API (set by Apple's own player) and forward
// non-sensitive now-playing metadata to the main process for MPRIS/tray/
// notifications. This reads only public, already-visible playback state —
// no credentials, cookies, or tokens are touched.
function pollMediaSession(): void {
  try {
    const ms = navigator.mediaSession;
    const audio = document.querySelector('audio, video') as HTMLMediaElement | null;
    const snapshot: MediaSessionSnapshot = {
      title: ms.metadata?.title ?? null,
      artist: ms.metadata?.artist ?? null,
      album: ms.metadata?.album ?? null,
      artwork: ms.metadata?.artwork?.[0]?.src ?? null,
      playing: audio ? !audio.paused : false,
      position: audio?.currentTime ?? 0,
      duration: audio?.duration ?? 0,
    };
    ipcRenderer.send('media-session:snapshot', snapshot);
  } catch {
    // Media Session API not yet available on this page load; retry later.
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setInterval(pollMediaSession, 1000);
});
