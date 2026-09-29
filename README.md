# Auralis

An unofficial Apple Music desktop client for Linux, by [Gautham Sai](https://github.com/gautham-sai05).

Auralis wraps Apple's own official web player (`music.apple.com`) in a hardened, native-feeling Electron shell with Linux desktop integration — tray icon, desktop notifications, and MPRIS (media keys, GNOME/KDE media widgets). It uses **your own Apple Music account and subscription**; Auralis has no server, no account system, and never sees or stores your Apple password.

## Why it works this way (read this before filing "why no custom UI" issues)

Apple does not publish a way for third-party native apps to authenticate against an Apple ID and play DRM-protected Apple Music streams. The only two legitimate integration paths are:

1. **The official web player** (`music.apple.com`) — full Apple Music UI, sign-in, browsing, and playback, running in a real browser engine. This is what Auralis embeds.
2. **MusicKit JS** — Apple's official JavaScript SDK that lets a web app build its *own* UI and drive playback, but it requires an **Apple Developer Program membership and a MusicKit developer token** to obtain. Auralis does not currently have one.

Because of (2), Auralis cannot yet ship a fully custom, from-scratch Music-app-style UI with real working playback controls — doing so without MusicKit would mean shipping buttons that don't actually do anything, which this project explicitly refuses to do. If you're the maintainer and obtain a MusicKit developer token, swapping the shell for a native MusicKit-driven UI (iOS/macOS-style library, browse, and now-playing screens) becomes possible and is the natural next milestone — track it as an issue.

**Nothing here bypasses FairPlay DRM, reverse-engineers private Apple APIs, or extracts protected streams.** Playback happens entirely inside Apple's own player code.

## What's implemented and verified

| Feature | Status |
|---|---|
| Loads the real Apple Music web player, sign-in through Apple's own flow | ✅ Built, launched and verified locally (loads, no crash, real console output from Apple's page) |
| Session persistence (stays signed in across restarts) | ✅ Via Electron's persistent session partition — standard Chromium cookie storage |
| Context isolation, sandboxed renderer, no Node integration in remote content | ✅ Implemented, see `electron/main.ts` |
| Navigation allowlist (only Apple auth/playback domains load in-app; everything else opens in your system browser) | ✅ Implemented and unit-tested (`electron/url-guard.test.ts`) |
| System tray (show/quit) | ✅ Built, launched locally |
| Desktop notifications on track change | ✅ Implemented via the page's Media Session API → IPC → `Notification` |
| MPRIS (media keys, GNOME Shell / KDE media widgets, `playerctl`) | ⚠️ Implemented against `dbus-next`; play/pause/next/previous relay by invoking the web player's own on-page buttons (no MusicKit access). This is **best-effort**: Apple can change its page markup at any time and silently break track skip/previous. Verified: the D-Bus service registers and the app does not crash if no session bus is present. Not verified against real GNOME/KDE media widgets on this machine. |
| Hi-Res / Lossless audio | ❌ **Not possible via the web player.** See below. |
| Custom Apple-Music-style library/browse UI | ❌ Not implemented — requires a MusicKit developer token (see above) |

## Hi-Res / Lossless audio — why it's not offered

Apple only serves Lossless and Hi-Res Lossless ALAC streams through its native, FairPlay-DRM-gated clients (macOS Music app, iOS/iPadOS, the Windows app). The web player at `music.apple.com` streams standard AAC regardless of your subscription tier or playback device — this is Apple's own platform limitation, not something Auralis can configure around, and there is no legitimate way to get hi-res into a Linux app without a native Apple client and circumventing DRM, which this project will not do. Auralis plays back at whatever quality the web player itself delivers.

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on the app's `BrowserWindow`.
- A strict navigation allowlist (`electron/url-guard.ts`) restricts in-app navigation to `music.apple.com` and Apple's own sign-in domains; everything else opens in your default browser via `shell.openExternal`.
- `setWindowOpenHandler` denies all `window.open` calls from web content and routes them to the system browser instead.
- All permission requests from web content (camera, mic, geolocation, etc.) are denied by default.
- The preload script exposes a minimal, read-only bridge (`window.auralis`) — it forwards only public, already-visible Media Session metadata (title/artist/album/playback position) for notifications and MPRIS. It never touches cookies, tokens, or credentials.
- No credentials, cookies, or session tokens are logged anywhere.

## Requirements

- A Linux desktop (X11 or Wayland; GNOME, KDE, and window-manager-only setups like Hyprland/Sway are all supported — Auralis does not depend on GNOME-specific services).
- PipeWire or PulseAudio for audio output (whichever your distro already uses; Auralis doesn't talk to either directly, Chromium's audio backend handles it).
- An active Apple Music subscription and Apple ID to sign in with.
- Optional: a running session D-Bus for MPRIS/media-key support. If none is present, Auralis logs a warning and continues running normally — this has been verified not to crash the app.

## Installing

### Arch Linux / EndeavourOS

A `PKGBUILD` is provided in `build/arch/PKGBUILD`. It has been written and structured for `makepkg`, using `electron-builder`'s `pacman` target as the underlying package builder. **It has not yet been run end-to-end against a tagged GitHub release** (that requires a published `v0.1.0` tag, which doesn't exist yet at the time of this commit) — once a release is tagged, verify with:

```bash
cd build/arch
makepkg -si
```

If you want to build and test locally right now, from a clone of this repo:

```bash
npm ci
npm run build
npx electron-builder --linux pacman --x64
sudo pacman -U release/*.pacman
```

### AppImage (any modern x86_64 distro)

```bash
npm ci
npm run build
npm run package:appimage
# → release/Auralis-0.1.0.AppImage
chmod +x release/Auralis-0.1.0.AppImage
./release/Auralis-0.1.0.AppImage
```

### Debian / Ubuntu (.deb)

```bash
npm ci
npm run build
npm run package:deb
sudo apt install ./release/auralis_0.1.0_amd64.deb
```

**Note:** the `.deb` packaging config has been written and is exercised by CI (see `.github/workflows/ci.yml`, which builds it on `ubuntu-latest`), but has not been installed and launch-tested on a real Debian/Ubuntu machine in this session — this repo's dev environment is Arch-based (EndeavourOS). Please open an issue if it doesn't work.

### From source (any distro with Node.js 20+)

```bash
git clone https://github.com/gautham-sai05/Auralis.git
cd Auralis
npm ci
npm run build
npm start
```

## Running on Arch Linux with Hyprland

Auralis makes no assumptions about your compositor. On Hyprland:

```bash
npm ci && npm run build && npm start
# or, once packaged:
./release/Auralis-0.1.0.AppImage
```

Tray icon support depends on Hyprland having a status bar with a systray module (e.g. `waybar` with the `tray` module) — without one, the tray icon simply won't be visible anywhere, but the app window itself is unaffected.

## Uninstalling

- **Arch (pacman):** `sudo pacman -R auralis`
- **Debian/Ubuntu (apt):** `sudo apt remove auralis`
- **AppImage:** delete the `.AppImage` file — it's fully self-contained.
- Config/session data lives under `~/.config/Auralis` (Electron's default `userData` path) and can be deleted separately if you want a clean sign-out.

## Development

```bash
npm ci
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint
npm test            # node:test unit tests (electron/*.test.ts)
npm start           # build + launch
```

## Compatibility matrix (what's actually been tested)

| Environment | Status |
|---|---|
| EndeavourOS (Arch-based), Wayland session, X11 fallback available | ✅ App builds, launches, loads music.apple.com, exits cleanly — tested in this session |
| Arch `pacman` packaging via `electron-builder` | ✅ Config present; not yet built into a `.pacman` file and installed in this session (see Installing) |
| Debian/Ubuntu `.deb` | ⚠️ Config present, built by CI; not installed/launch-tested on real Debian/Ubuntu |
| Fedora / openSUSE | ❌ Not tested. AppImage should work generically; no RPM packaging config included yet |
| GNOME, KDE Plasma | ❌ Not tested in this session (dev environment has neither running) |
| Hyprland / other wlroots compositors | ✅ Consistent with the environment this was built and launch-tested in |
| MPRIS media-key integration against a real desktop widget | ❌ D-Bus service registration implemented; not verified against an actual GNOME/KDE media widget |

## Known limitations

- No custom native library/browse UI — see explanation above.
- No Hi-Res/Lossless audio — Apple platform limitation, not fixable client-side.
- MPRIS next/previous controls rely on Apple's page DOM structure and may silently stop working if Apple changes it.
- No offline downloads (not exposed by the web player).
- No lyrics (not reliably exposed by the web player's DOM in a stable way this session had time to verify).

## License

MIT — see [LICENSE](LICENSE).
