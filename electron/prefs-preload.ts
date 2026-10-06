import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('prefs', {
  getState: (): Promise<unknown> => ipcRenderer.invoke('prefs:getState'),
  setSetting: (key: string, value: unknown): void => ipcRenderer.send('prefs:setSetting', key, value),
  setLoginItem: (enabled: boolean): void => ipcRenderer.send('prefs:setLoginItem', enabled),
  relaunch: (): void => ipcRenderer.send('prefs:relaunch'),
  exportSettings: (): Promise<string | null> => ipcRenderer.invoke('prefs:export'),
  importSettings: (): Promise<string | null> => ipcRenderer.invoke('prefs:import'),
});
