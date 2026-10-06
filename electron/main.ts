import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, Tray as TrayType, Event as ElectronEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupMpris } from './mpris.js';
import { isAllowedUrl } from './url-guard.js';
import { loadWindowState, trackWindowState } from './window-state.js';
import { checkForUpdate } from './update-checker.js';
import { loadSettings, saveSettings, type Settings } from './settings.js';
import { createPlayerControl } from './player-control.js';
import { loadHistory, saveHistory, addEntry, type HistoryEntry } from './history.js';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, session, Notification, clipboard, dialog } = electron;

// Loaded synchronously, before 'ready', specifically so the hardware
// acceleration decision below can be settings-driven. app.getPath works
// before 'ready' (verified directly: logged identical paths pre- and
// post-ready in this exact invocation style), so this is safe.
const initialSettings = loadSettings(app.getPath('userData'));

// Works around a real, repeatedly-observed crash on this Wayland/Mesa setup:
// the GPU process segfaults 2-3 times on every cold start trying to allocate
// a hardware scanout buffer ("Cannot create bo with format=RGBA_8888 and
// usage=SCANOUT"), each time triggering a ~1.5s automatic Chromium restart of
// that process before it eventually gives up and falls back on its own.
// `disable-gpu-sandbox` alone did NOT fix this (tested: identical 3-crash
// pattern with it set). Fully disabling GPU hardware acceleration does,
// verified by rerunning the same launch after adding this line and seeing
// zero gpu_process_host crash-loop lines. That bug is specific to this kind
// of driver/compositor combination though, not universal — so this is now a
// persisted, tray-toggleable setting (default off, matching the verified-safe
// state) rather than an unconditional call, so capable hardware isn't stuck
// paying the software-rendering cost for a bug it may not have.
if (!initialSettings.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// Without this, launching Auralis twice creates two windows both trying to
// play audio and both trying to claim the same MPRIS bus name (only one
// would win, leaving the other's media keys dead) — a real, easy-to-hit bug
// for anyone with a "launch on login" habit or a flaky launcher double-click.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const APPLE_MUSIC_URL = 'https://music.apple.com/';

const EQUALIZER_LABELS: Record<Settings['equalizerPreset'], string> = {
  flat: 'Flat (Off)',
  bassBoost: 'Bass Boost',
  trebleBoost: 'Treble Boost',
  vocalBoost: 'Vocal Boost',
};

let mainWindow: BrowserWindowType | null = null;
let tray: TrayType | null = null;
let searchPalette: BrowserWindowType | null = null;
let miniPlayer: BrowserWindowType | null = null;
let latestSnapshot: { title: string | null; artist: string | null; artwork: string | null; playing: boolean } | null =
  null;
let isQuitting = false;
let offlineRetryTimer: ReturnType<typeof setInterval> | null = null;
const settings: Settings = initialSettings;
let history: HistoryEntry[] = [];
let currentTrack: HistoryEntry | null = null;
let rebuildTrayMenu: (() => void) | null = null;

function persistSettings(): void {
  saveSettings(app.getPath('userData'), settings);
}

function openSearchPalette(): void {
  if (searchPalette) {
    searchPalette.focus();
    return;
  }
  const parent = mainWindow;
  const win = new BrowserWindow({
    width: 560,
    height: 72,
    parent: parent ?? undefined,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'search-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (parent) {
    const pb = parent.getBounds();
    win.setPosition(Math.round(pb.x + pb.width / 2 - 280), Math.round(pb.y + 120));
  }
  void win.loadFile(path.join(__dirname, '..', 'build', 'search.html'));
  win.once('ready-to-show', () => win.show());
  searchPalette = win;
  win.on('closed', () => {
    searchPalette = null;
  });
}

function closeSearchPalette(): void {
  searchPalette?.close();
}

function openMiniPlayer(): void {
  if (miniPlayer) {
    miniPlayer.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 320,
    height: 90,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#15151a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'mini-player-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(path.join(__dirname, '..', 'build', 'mini-player.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (latestSnapshot) win.webContents.send('mini-player:update', latestSnapshot);
  });
  miniPlayer = win;
  win.on('closed', () => {
    miniPlayer = null;
  });
}

function closeMiniPlayer(): void {
  miniPlayer?.close();
}

ipcMain.on('mini-player:close', () => closeMiniPlayer());
ipcMain.on('mini-player:control', (_event, action: unknown) => {
  if (!mainWindow) return;
  const control = createPlayerControl(mainWindow);
  if (action === 'playPause') control.playPause();
  else if (action === 'next') control.next();
  else if (action === 'previous') control.previous();
});

ipcMain.on('search-palette:cancel', () => closeSearchPalette());
ipcMain.on('search-palette:submit', (_event, query: unknown) => {
  if (typeof query === 'string' && query.trim() && mainWindow) {
    const url = `https://music.apple.com/search?term=${encodeURIComponent(query.trim())}`;
    mainWindow.loadURL(url);
    mainWindow.show();
    mainWindow.focus();
  }
  closeSearchPalette();
});

function stopOfflineRetry(): void {
  if (offlineRetryTimer) {
    clearInterval(offlineRetryTimer);
    offlineRetryTimer = null;
  }
}

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
      // Named persistent partition (rather than relying on the implicit
      // default session) so sign-in survives restarts reliably. Cider users
      // have long reported "resume last session" silently failing on Linux;
      // an explicit, named partition removes any ambiguity about which
      // session store is actually being read from and written to.
      partition: 'persist:auralis',
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

  // Network failures (offline, DNS down, Apple's servers unreachable) would
  // otherwise show Chromium's bare "can't reach this page" error screen —
  // jarring and inconsistent with the rest of the app. Show a branded page
  // instead and keep retrying quietly until it comes back.
  win.webContents.on('did-fail-load', (_event, errorCode, description, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED: a normal cancelled navigation */) return;
    if (validatedURL.startsWith('file://')) return; // don't loop if the local page itself fails
    console.warn(`[auralis] failed to load ${validatedURL}: ${description} (${errorCode}); showing offline page`);
    void win.loadFile(path.join(__dirname, '..', 'build', 'offline.html'));
    if (!offlineRetryTimer) {
      offlineRetryTimer = setInterval(() => {
        void win.loadURL(APPLE_MUSIC_URL);
      }, 5000);
    }
  });
  win.webContents.on('did-finish-load', () => {
    if (win.webContents.getURL().includes('music.apple.com')) {
      stopOfflineRetry();
    }
  });

  // If the renderer itself crashes (OOM, a Chromium bug) rather than just
  // failing to load, Electron leaves a blank, permanently dead window with
  // no way back short of force-quitting. Reload it automatically instead.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.warn('[auralis] renderer process gone:', details.reason);
    if (details.reason !== 'clean-exit') {
      void win.loadURL(APPLE_MUSIC_URL);
    }
  });

  // In-app keyboard shortcuts. Transport/volume/seek use a Ctrl+Alt modifier
  // specifically to avoid colliding with anything Apple's own page might
  // bind to plain arrows/space/digits (e.g. typing in its search box);
  // zoom and the search palette use conventional combos that Electron
  // doesn't wire up on its own since this app has no application menu.
  const control = createPlayerControl(win);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control;
    const alt = input.alt;
    if (ctrl && alt) {
      switch (input.key) {
        case ' ':
          event.preventDefault();
          control.playPause();
          return;
        case 'ArrowLeft':
          event.preventDefault();
          control.seekRelative(-10);
          return;
        case 'ArrowRight':
          event.preventDefault();
          control.seekRelative(10);
          return;
        case 'ArrowUp':
          event.preventDefault();
          control.adjustVolume(0.05);
          return;
        case 'ArrowDown':
          event.preventDefault();
          control.adjustVolume(-0.05);
          return;
        case '1':
          event.preventDefault();
          void win.loadURL('https://music.apple.com/listen-now');
          return;
        case '2':
          event.preventDefault();
          void win.loadURL('https://music.apple.com/browse');
          return;
        case '3':
          event.preventDefault();
          void win.loadURL('https://music.apple.com/library/albums');
          return;
        case 'm':
        case 'M':
          event.preventDefault();
          openMiniPlayer();
          return;
        default:
          break;
      }
    } else if (ctrl && !alt) {
      switch (input.key) {
        case 'k':
        case 'K':
          event.preventDefault();
          openSearchPalette();
          return;
        case '=':
        case '+':
          event.preventDefault();
          win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
          return;
        case '-':
          event.preventDefault();
          win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
          return;
        case '0':
          event.preventDefault();
          win.webContents.setZoomLevel(0);
          return;
        default:
          break;
      }
    }
  });

  // Deny every permission request (camera, mic, notifications-from-page,
  // etc.) by default; Apple's web player does not need any of these to play
  // audio, and the app's own native notifications are driven separately.
  session.fromPartition('persist:auralis').setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

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

  // Close-to-tray: hide instead of quitting. This is a deliberately simple,
  // hard-to-break implementation — Cider's Linux users have long reported
  // "Close to Tray" instead closing the app outright, which tends to happen
  // when the behavior is gated behind a settings flag that can end up unset
  // or misread. Here it's unconditional and the only way to actually quit is
  // the tray's Quit item, so there's no state to get out of sync.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      if (!settings.hasShownTrayHint) {
        settings.hasShownTrayHint = true;
        persistSettings();
        if (settings.notificationsEnabled && Notification.isSupported()) {
          new Notification({
            title: 'Auralis is still running',
            body: 'Closing the window keeps Auralis in the tray. Quit from the tray menu to exit fully.',
            silent: true,
          }).show();
        }
      }
    }
  });

  // Opt-in: some users want the taskbar entry gone on minimize too, not
  // just on close. Off by default since it changes window-manager behavior
  // users didn't ask for; toggled from the tray menu.
  win.on('minimize', (event: ElectronEvent) => {
    if (settings.minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', stopOfflineRetry);

  return win;
}

async function notifyUpdateResult(silent: boolean): Promise<void> {
  const result = await checkForUpdate(app.getVersion());
  const canNotify = settings.notificationsEnabled && Notification.isSupported();
  if (!result) {
    if (!silent && canNotify) {
      new Notification({ title: 'Auralis', body: "Couldn't check for updates right now." }).show();
    }
    return;
  }
  if (result.available) {
    if (canNotify) {
      new Notification({
        title: 'Update available',
        body: 'A newer version of Auralis is available on GitHub.',
      }).show();
    }
    void shell.openExternal(result.url);
  } else if (!silent && canNotify) {
    new Notification({ title: 'Auralis', body: "You're up to date." }).show();
  }
}

function createTray(win: BrowserWindowType): TrayType {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 24, height: 24 });
  const t = new Tray(trayIcon);
  t.setToolTip('Auralis');

  const rebuildMenu = (): void => {
    let openAtLogin = false;
    try {
      openAtLogin = app.getLoginItemSettings().openAtLogin;
    } catch {
      // Login-item support varies across Linux desktop environments; if the
      // query fails, just default the toggle to off rather than crashing.
    }
    const recentlyPlayed =
      history.length > 0
        ? history.map((entry) => ({
            label: [entry.title, entry.artist].filter(Boolean).join(' — ') || entry.title,
            enabled: Boolean(entry.url),
            click: () => {
              if (entry.url) {
                win.loadURL(entry.url);
                win.show();
                win.focus();
              }
            },
          }))
        : [{ label: 'Nothing played yet', enabled: false }];
    const menu = Menu.buildFromTemplate([
      { label: 'Show Auralis', click: () => win.show() },
      { label: 'Search…', accelerator: 'CmdOrCtrl+K', click: () => openSearchPalette() },
      { label: 'Mini Player', accelerator: 'Ctrl+Alt+M', click: () => openMiniPlayer() },
      { label: 'Recently Played', submenu: recentlyPlayed },
      {
        label: 'Copy Current Track Link',
        enabled: Boolean(currentTrack?.url),
        click: () => {
          if (currentTrack?.url) clipboard.writeText(currentTrack.url);
        },
      },
      {
        label: 'Open Current Track in Browser',
        enabled: Boolean(currentTrack?.url),
        click: () => {
          if (currentTrack?.url) void shell.openExternal(currentTrack.url);
        },
      },
      { type: 'separator' },
      {
        label: 'Start at Login',
        type: 'checkbox',
        checked: openAtLogin,
        click: (item) => {
          try {
            app.setLoginItemSettings({ openAtLogin: item.checked });
          } catch {
            // Best-effort; some Linux setups don't support this.
          }
        },
      },
      {
        label: 'Minimize to Tray',
        type: 'checkbox',
        checked: settings.minimizeToTray,
        click: (item) => {
          settings.minimizeToTray = item.checked;
          persistSettings();
        },
      },
      {
        label: 'Notifications',
        type: 'checkbox',
        checked: settings.notificationsEnabled,
        click: (item) => {
          settings.notificationsEnabled = item.checked;
          persistSettings();
        },
      },
      {
        label: 'Equalizer',
        submenu: (['flat', 'bassBoost', 'trebleBoost', 'vocalBoost'] as const).map((preset) => ({
          label: EQUALIZER_LABELS[preset],
          type: 'radio' as const,
          checked: settings.equalizerPreset === preset,
          click: () => {
            settings.equalizerPreset = preset;
            persistSettings();
            createPlayerControl(win).setEqualizer(preset);
          },
        })),
      },
      {
        label: 'Hardware Acceleration (restarts app)',
        type: 'checkbox',
        checked: settings.hardwareAcceleration,
        click: (item) => {
          settings.hardwareAcceleration = item.checked;
          persistSettings();
          // This is decided once, at module load, before 'ready' — so the
          // only way to apply a change is a fresh process.
          isQuitting = true;
          app.relaunch();
          app.exit(0);
        },
      },
      { type: 'separator' },
      {
        label: 'Check for Updates…',
        click: () => void notifyUpdateResult(false),
      },
      {
        label: 'Sign Out',
        click: () => {
          void session
            .fromPartition('persist:auralis')
            .clearStorageData()
            .then(() => win.loadURL(APPLE_MUSIC_URL));
        },
      },
      {
        label: 'About Auralis',
        click: () => {
          void dialog.showMessageBox(win, {
            type: 'info',
            title: 'About Auralis',
            message: 'Auralis',
            detail: `Version ${app.getVersion()}\nAn unofficial Apple Music desktop client for Linux.\nhttps://github.com/gautham-sai05/Auralis`,
          });
        },
      },
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
  };

  rebuildTrayMenu = rebuildMenu;
  rebuildMenu();
  t.on('click', () => win.show());
  return t;
}

if (gotSingleInstanceLock) {
  // A second launch attempt (e.g. clicking the app icon again) should just
  // bring the existing window forward, not open a second one.
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    history = loadHistory(app.getPath('userData'));
    mainWindow = createWindow();
    tray = createTray(mainWindow);

    setupMpris(mainWindow, () => settings.notificationsEnabled, (snapshot) => {
      const entry: HistoryEntry = {
        title: snapshot.title ?? '',
        artist: snapshot.artist,
        album: snapshot.album,
        url: snapshot.url && snapshot.url.includes('music.apple.com') ? snapshot.url : null,
        playedAt: Date.now(),
      };
      currentTrack = entry;
      history = addEntry(history, entry);
      saveHistory(app.getPath('userData'), history);
      rebuildTrayMenu?.();
      // Apple's player may swap in a new <audio> element per track; the
      // equalizer wrapper is element-specific, so re-apply on every track
      // change. Only acts if the user has ever actually picked a preset —
      // otherwise this is a no-op and the audio graph is never touched.
      if (settings.equalizerPreset !== 'flat' && mainWindow) {
        createPlayerControl(mainWindow).setEqualizer(settings.equalizerPreset);
      }
    }, (snapshot) => {
      latestSnapshot = {
        title: snapshot.title,
        artist: snapshot.artist,
        artwork: snapshot.artwork,
        playing: snapshot.playing,
      };
      miniPlayer?.webContents.send('mini-player:update', latestSnapshot);
    }).catch((err) => {
      // MPRIS is a nice-to-have; its absence must never crash the app.
      console.warn('[auralis] MPRIS integration unavailable:', err instanceof Error ? err.stack : err);
    });

    ipcMain.handle('app:getVersion', () => app.getVersion());

    // Delayed and silent: only speaks up if an update is actually available,
    // well after the app has had time to load so it never competes with
    // startup for network bandwidth.
    setTimeout(() => void notifyUpdateResult(true), 15000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else {
        mainWindow?.show();
      }
    });
  });
}

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
