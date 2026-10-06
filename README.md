# Auralis

**An unofficial Apple Music desktop client for Linux.**

Auralis wraps Apple's own web player in a hardened, native-feeling Electron shell with proper Linux desktop integration — tray icon, MPRIS media controls, desktop notifications, a floating mini player, keyboard shortcuts, and more. It signs in with your own Apple Music account; there's no server, no account system, and no password handling of its own.

## Why a web wrapper, not a native UI

Apple doesn't offer third-party native apps a way to authenticate and play DRM-protected Apple Music streams. There are only two legitimate ways in:

1. **The official web player** (`music.apple.com`) — full sign-in, browsing, and playback in a real browser engine. This is what Auralis embeds.
2. **MusicKit JS**, Apple's own SDK for building a custom UI with real playback — but it requires an Apple Developer Program membership and a MusicKit token that this project doesn't have.

Without a MusicKit token, a custom native UI would mean shipping controls that don't actually work — not something this project does. Nothing here bypasses FairPlay DRM, reverse-engineers private APIs, or extracts protected streams; playback happens entirely inside Apple's own player code.

## Features

**Playback & media keys**
- MPRIS2 integration (`org.mpris.MediaPlayer2.auralis`) — play/pause/next/previous, volume, and seeking, for media keys, lock-screen widgets, and desktop shell integrations
- A floating, always-on-top mini player with artwork, title/artist, and transport controls
- A 3-band equalizer (Flat, Bass Boost, Treble Boost, Vocal Boost) applied via the Web Audio API
- Desktop notifications on track change, with real album artwork

**Desktop integration**
- System tray with quick controls, recently played, and settings
- Close-to-tray and optional minimize-to-tray
- Window position/size persisted between launches
- Start at login
- Single-instance locking — a second launch focuses the existing window instead of opening a duplicate
- Branded splash screen and offline/connection-error page with automatic retry
- Automatic recovery if the renderer process crashes

**Productivity**
- `Ctrl+K` command palette — jump straight to Apple Music search results
- Recently played history with one-click return to any of the last 20 tracks
- Copy/open the current track's link, for sharing what's playing
- In-app keyboard shortcuts for playback, volume, seeking, zoom, and navigation (see below)
- A lightweight, non-telemetry update checker against GitHub releases

**Performance**
- Hardware acceleration is configurable (tray toggle): off by default to avoid a known GPU crash loop on some Wayland/Mesa driver combinations, but can be re-enabled on hardware that doesn't hit it
- No background polling beyond a lightweight once-per-second now-playing check; all other timers (offline retry, update check) are event-driven or one-shot

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Open search |
| `Ctrl+Alt+Space` | Play / pause |
| `Ctrl+Alt+←` / `→` | Seek −10s / +10s |
| `Ctrl+Alt+↑` / `↓` | Volume up / down |
| `Ctrl+Alt+1` / `2` / `3` | Listen Now / Browse / Library |
| `Ctrl+Alt+M` | Open mini player |
| `Ctrl+=` / `-` / `0` | Zoom in / out / reset |

Playback shortcuts use `Ctrl+Alt` so they never collide with typing inside Apple's own page (search, playlist names, comments).

## Installation

### AppImage (any modern x86_64 distro)

```bash
npm ci && npm run build && npm run package:appimage
chmod +x release/Auralis-*.AppImage
./release/Auralis-*.AppImage
```

Optionally add it to your app launcher:

```bash
./scripts/install-appimage.sh release/Auralis-*.AppImage
```

### Arch Linux / EndeavourOS

```bash
cd build/arch
makepkg -si
```

### Debian / Ubuntu (.deb)

```bash
npm ci && npm run build && npm run package:deb
sudo apt install ./release/auralis_*_amd64.deb
```

### Fedora / openSUSE (.rpm)

```bash
npm ci && npm run build && npm run package:rpm
sudo rpm -i release/auralis-*.x86_64.rpm
```

### Flatpak

```bash
npm ci && npm run build && npm run package:flatpak
flatpak install release/Auralis-*.flatpak
```

### From source

```bash
git clone https://github.com/gautham-sai05/Auralis.git
cd Auralis
npm ci && npm run build
npm start
```

Requires Node.js 20+. Works on X11 and Wayland, under any desktop environment or standalone window manager.

## Uninstalling

| Install method | Command |
|---|---|
| Arch (pacman) | `sudo pacman -R auralis` |
| Debian/Ubuntu (apt) | `sudo apt remove auralis` |
| Fedora/openSUSE (rpm) | `sudo rpm -e auralis` |
| Flatpak | `flatpak uninstall dev.gauthamsai.auralis` |
| AppImage | delete the `.AppImage` file |

Config, session, and history data live under `~/.config/Auralis` and can be deleted separately for a clean sign-out.

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on every window
- A strict navigation allowlist (`electron/url-guard.ts`) restricts in-app navigation to `music.apple.com` and Apple's own sign-in domains; everything else opens in the system browser
- `setWindowOpenHandler` denies all `window.open` calls and routes them to the system browser instead
- All permission requests from web content (camera, mic, geolocation, etc.) are denied by default
- The preload bridge exposes only public, already-visible Media Session metadata (title, artist, album, position) — never cookies, tokens, or credentials
- No credentials, cookies, or session tokens are ever logged

## Development

```bash
npm ci
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint
npm test            # unit tests
npm start           # build + launch
```

Key source layout:

| Path | Purpose |
|---|---|
| `electron/main.ts` | App lifecycle, windows, tray, shortcuts |
| `electron/mpris.ts` | MPRIS2 D-Bus service |
| `electron/player-control.ts` | Shared playback/volume/seek/EQ control, used by MPRIS and shortcuts alike |
| `electron/preload.ts` | Sandboxed bridge exposing Media Session data to the main process |
| `electron/url-guard.ts` | Navigation allowlist |
| `electron/settings.ts`, `history.ts`, `window-state.ts` | Persisted local state |

## Known limitations

- **No custom native UI** — see "Why a web wrapper" above.
- **No Hi-Res/Lossless audio** — Apple only serves those through FairPlay-gated native clients; the web player streams standard AAC everywhere, not just on Linux.
- **No offline downloads or lyrics** — not exposed by the web player.
- **Transport controls (play/pause/next/previous) are best-effort** — they work by invoking Apple's own on-page buttons, since there's no stable API for them without a MusicKit token. Volume and seeking are more robust, since they act on the page's actual `<audio>` element directly.
- **The equalizer wraps the page's audio element in a Web Audio graph** — safe by design (off by default, mild gains, defensive error handling) but hasn't been exercised against a real, signed-in playback session. Report any audio issues after enabling it.
- **Discord/Last.fm integration** is not included — both require an API key tied to a developer account that would need to be created separately. Open an issue if you'd like to provide one.

## License

MIT — see [LICENSE](LICENSE).
