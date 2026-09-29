import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, Tray as TrayType } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupMpris } from './mpris.js';
import { isAllowedUrl } from './url-guard.js';
import { loadWindowState, trackWindowState } from './window-state.js';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, session } = electron;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const APPLE_MUSIC_URL = 'https://music.apple.com/';

let mainWindow: BrowserWindowType | null = null;
let tray: TrayType | null = null;
let isQuitting = false;

function createWindow(): BrowserWindowType {
  const state = loadWindowState(app.getPath('userData'));
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0b0d',
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();
  trackWindowState(win, app.getPath('userData'));

  win.once('ready-to-show', () => win.show());

  // Show a branded local splash instantly (no network needed), then swap to
  // the real Apple Music player once it's ready. Avoids a blank/white flash
  // on slower connections and gives the app its own identity on launch.
  void win.loadFile(path.join(__dirname, '..', 'build', 'loading.html'));
  win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().startsWith('file://')) {
      void win.loadURL(APPLE_MUSIC_URL);
    }
  });

  // Deny every permission request (camera, mic, notifications-from-page,
  // etc.) by default; Apple's web player does not need any of these to play
  // audio, and the app's own native notifications are driven separately.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  // Block navigation to anything outside Apple's authentication/playback domains.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Any window.open (e.g. links inside the web player) opens in the
  // system browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createTray(win: BrowserWindowType): TrayType {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 24, height: 24 });
  const t = new Tray(trayIcon);
  t.setToolTip('Auralis');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Auralis', click: () => win.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  t.setContextMenu(menu);
  t.on('click', () => win.show());
  return t;
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  tray = createTray(mainWindow);

  setupMpris(mainWindow).catch((err) => {
    // MPRIS is a nice-to-have; its absence must never crash the app.
    console.warn('[auralis] MPRIS integration unavailable:', err instanceof Error ? err.stack : err);
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  tray?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep the tray alive on Linux instead of quitting; user quits via tray.
  }
});

if (isDev) {
  app.commandLine.appendSwitch('enable-logging');
}
