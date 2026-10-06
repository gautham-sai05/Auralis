import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('searchPalette', {
  submit: (query: string): void => ipcRenderer.send('search-palette:submit', query),
  cancel: (): void => ipcRenderer.send('search-palette:cancel'),
});
