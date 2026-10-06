import { contextBridge, ipcRenderer } from 'electron';

interface MiniPlayerSnapshot {
  title: string | null;
  artist: string | null;
  artwork: string | null;
  playing: boolean;
}

contextBridge.exposeInMainWorld('miniPlayer', {
  onUpdate: (callback: (data: MiniPlayerSnapshot) => void): (() => void) => {
    const handler = (_event: unknown, data: MiniPlayerSnapshot): void => callback(data);
    ipcRenderer.on('mini-player:update', handler);
    return () => ipcRenderer.removeListener('mini-player:update', handler);
  },
  playPause: (): void => ipcRenderer.send('mini-player:control', 'playPause'),
  next: (): void => ipcRenderer.send('mini-player:control', 'next'),
  previous: (): void => ipcRenderer.send('mini-player:control', 'previous'),
  close: (): void => ipcRenderer.send('mini-player:close'),
});
