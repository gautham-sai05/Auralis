# Auralis

An unofficial Apple Music desktop client for Linux, by [Gautham Sai](https://github.com/gautham-sai05).

Auralis wraps Apple's own web player (`music.apple.com`) in a hardened, native-feeling Electron shell with proper Linux desktop integration: a tray icon, desktop notifications, and MPRIS support for media keys and media widgets. It signs in with your own Apple Music account and subscription — there's no server and no account system of its own, and it never sees or stores your Apple password.

## Why it works this way

Before you file an issue asking why there's no custom Music-app-style UI: Apple doesn't publish a way for third-party native apps to authenticate against an Apple ID and play DRM-protected Apple Music streams. There are really only two legitimate paths in:

1. **The official web player** at `music.apple.com` — full sign-in, browsing, and playback, running in a real browser engine. This is what Auralis embeds.
2. **MusicKit JS**, Apple's own JavaScript SDK, which lets a web app build its own UI and drive playback directly. But it requires an Apple Developer Program membership and a MusicKit developer token, and Auralis doesn't have one yet.

Because of that second point, this version can't ship a fully custom UI with real working playback controls. Building one without MusicKit would mean shipping buttons that don't actually do anything, and that's not something this project is willing to do. If a MusicKit developer token becomes available down the line, swapping in a proper native UI — an iOS/macOS-style library, browse, and now-playing screen — becomes possible, and would be the obvious next step.

To be clear: nothing here bypasses FairPlay DRM, reverse-engineers private Apple APIs, or extracts protected streams. Playback happens entirely inside Apple's own player code.

## What's actually working

This section separates what's been built and tested from what's just configured. If something doesn't say it was tested, assume it wasn't.

**Confirmed working, tested in this environment:**

- The real Apple Music web player loads and signs in through Apple's own flow — launched and watched load without crashing, with real console output from Apple's own page confirming it.
- Session persistence across restarts, through a named persistent partition (`persist:auralis`) rather than the implicit default session, specifically so there's no ambiguity about which store sign-in state is read from.
- Context isolation, a sandboxed renderer, and no Node integration exposed to remote content.
- A navigation allowlist that only lets Apple's own auth/playback domains load inside the app — everything else opens in your system browser. Covered by unit tests (`electron/url-guard.test.ts`).
- The system tray, and closing the window hides it there rather than quitting — deliberately unconditional, with the only way to actually exit being the tray's Quit item. (Cider, the main existing Apple Music Linux client, has long-standing reports of "Close to Tray" instead closing the app outright; this sidesteps that class of bug by not having a settings flag to get out of sync in the first place.) A one-time notification tells you where the app went the first time you close it.
- Desktop notifications on track change, including the actual album artwork — downloaded once and cached, since Electron's notification icon needs a local file rather than a remote URL.
- A branded splash screen — an animated soundwave mark matching the app icon — that shows instantly on launch and hands off to the real player once it's ready.
- Window size and position getting remembered between launches.
- A GPU crash loop on this Wayland/Mesa setup, caught by actually watching the logs: the GPU process was segfaulting 2-3 times on every single cold start trying to allocate a hardware scanout buffer, each time forcing a ~1.5s automatic restart before eventually recovering. `app.disableHardwareAcceleration()` eliminates it — verified by rerunning the identical launch and counting zero crash-loop lines where there were three before. (A first attempt at fixing this, `disable-gpu-sandbox`, was tested and did *not* work — left out rather than left in as a claim.)
- MPRIS: the app registers a real D-Bus service (`org.mpris.MediaPlayer2.auralis`), and this was checked directly with `dbus-send` — a live `Identity` query returned `"Auralis"` from a running instance, and a `GetAll` on the Player interface returned real `CanSeek`, `Position`, and `Volume` values. Play/pause/next/previous work by clicking the web player's own on-page buttons (there's no MusicKit access to call instead), which is inherently best-effort: if Apple changes its page markup, track skip could quietly stop working. Volume and seeking instead address the page's actual `<audio>`/`<video>` element directly (`a.volume`, `a.currentTime`), which is more robust than button-clicking since that element's API is standard and not Apple-markup-dependent. None of this has been checked against a real GNOME Shell or KDE media widget, only against raw D-Bus calls, and a live `Set Volume` round-trip only takes effect once a track's media element actually exists on the page (i.e. during real playback, not on a signed-out/idle page — confirmed by testing both states).
- The AppImage was actually built and run, not just configured — it launches, shows the splash, and loads the real Apple Music page cleanly.
- The Arch package: a `.pkg.tar.zst` built from the `PKGBUILD`'s packaging logic was checked and is structurally correct, and the exact binary it installs was launched directly and ran with zero errors. What wasn't done is the final `sudo pacman -U` — this development session had no interactive sudo access to run it.
- Single-instance lock: launching Auralis a second time brings the existing window forward instead of opening a duplicate (which would otherwise mean two windows both playing audio and both fighting over the same MPRIS bus name). Verified by actually launching it twice — the second process never reaches window/MPRIS setup at all.
- Offline handling: a network failure (server unreachable, no connection) shows a branded retry page instead of Chromium's bare error screen, and keeps retrying every 5 seconds until it reconnects. Verified for real by forcing a connection failure (`--host-resolver-rules`) and watching it detect the failure, show the page, and keep retrying on schedule.
- Renderer crash recovery: if the page itself crashes rather than just failing to load, the window automatically reloads instead of sitting there permanently blank.
- Start at Login and Sign Out, both in the tray menu — sign-out clears the persistent session partition and forces a fresh sign-in page.
- A lightweight update check against GitHub's releases API (no telemetry, a single unauthenticated request): silent on startup unless a newer version exists, plus a manual "Check for Updates" tray item.
- The `.deb` package: now builds and was inspected directly (`ar`/`tar` on the resulting archive) — correct control metadata, dependencies, and a real multi-hundred-MB data payload. The `fpm` binary download that previously hung indefinitely in this sandbox succeeded this time; that was a transient networking issue in the sandbox, not a real blocker.
- Two new settings-driven features, both persisted to a small `settings.json` in `userData` and toggled from the tray menu: "Minimize to Tray" (hides on minimize, not just on close — off by default since it changes window-manager behavior nobody asked for) and a "Notifications" on/off switch that gates every native notification the app shows (track-change, tray-hint, and update-check alike).

**Not possible, and why:**

- Hi-Res / Lossless audio. Apple only serves Lossless and Hi-Res Lossless streams through its native, FairPlay-gated clients (macOS Music, iOS/iPadOS, the Windows app). The web player streams standard AAC no matter your subscription tier or device, on every platform, not just Linux. There's no legitimate way around this without a native Apple client and circumventing DRM, which won't happen here.
- A custom library/browse UI, for the MusicKit reason explained above.

**Looked at, deliberately left out:**

- Discord Rich Presence — a feature the main existing Apple Music Linux clients (Cider, Sidra) all offer, showing what's playing as your Discord status. It's technically straightforward to add on top of the same media-session data already captured for MPRIS, but registering a Discord Rich Presence integration requires creating a Discord application to get a client ID, which is an account-holder action, not something that can be done on your behalf. If you create one (a couple of minutes at [discord.com/developers](https://discord.com/developers/applications)), open an issue with the client ID and this gets wired in.

**Unverified, not because it's expected to fail, but because it wasn't checked here:**

- The `.rpm` and `.flatpak` targets, both newly added for Fedora/openSUSE and the Flatpak ecosystem respectively. `electron-builder` requires `rpmbuild` (for `.rpm`) and `flatpak-builder` (for `.flatpak`), neither of which is installed in this sandbox and neither of which could be installed without root. Both configs went through `electron-builder`'s own validation and got as far as actually invoking the missing external tool — i.e. everything electron-builder itself controls is correct, but the final package has not been produced or run. CI will report their real status once it runs with the right tooling installed.
- Fedora, openSUSE, GNOME, and KDE Plasma — nothing here runs any of those, so none of it has been tested there. The AppImage should work generically on any modern x86_64 distro, but "should" isn't "has been."

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on the app's `BrowserWindow`.
- A strict navigation allowlist (`electron/url-guard.ts`) restricts in-app navigation to `music.apple.com` and Apple's own sign-in domains; everything else opens in your default browser via `shell.openExternal`.
- `setWindowOpenHandler` denies all `window.open` calls from web content and routes them to the system browser instead.
- All permission requests from web content (camera, mic, geolocation, and so on) are denied by default.
- The preload script exposes a minimal, read-only bridge (`window.auralis`) that forwards only public, already-visible Media Session metadata (title, artist, album, playback position) for notifications and MPRIS. It never touches cookies, tokens, or credentials.
- No credentials, cookies, or session tokens are logged anywhere.

## Requirements

- A Linux desktop, X11 or Wayland. GNOME, KDE, and window-manager-only setups like Hyprland or Sway are all fine — nothing here depends on GNOME-specific services.
- PipeWire or PulseAudio for audio output, whichever your distro already uses. Auralis doesn't talk to either directly; Chromium's audio backend handles that.
- An active Apple Music subscription and Apple ID to sign in with.
- Optionally, a running session D-Bus for MPRIS and media-key support. If there isn't one, Auralis logs a warning and keeps running normally — this was verified not to crash the app.

## Installing

### Arch Linux / EndeavourOS

The `PKGBUILD` at `build/arch/PKGBUILD` builds the app with `electron-builder --linux dir` (a plain unpacked Electron app) rather than the `pacman` target, because that target pulls in `fpm`, which hung indefinitely trying to download its bundled binary in this environment. Packaging the plain `dir` output directly with `makepkg` is also just the more standard approach for Electron apps on the AUR.

A package built from this exact `package()` logic was checked with `makepkg` and produces a structurally valid `.pkg.tar.zst` — correct `.PKGINFO`, correct layout under `/usr/lib/auralis`, `/usr/bin/auralis`, desktop entry, icon, license. The packaged binary itself (`release/linux-unpacked/auralis`, byte-for-byte what ends up at `/usr/lib/auralis/auralis`) was launched directly and ran with no errors. What's left is the actual `sudo pacman -U` step, which needs a real terminal with sudo access:

```bash
cd build/arch
makepkg -si   # once a v0.1.0 tag exists; builds, then installs with pacman
```

To build and test against your current checkout without a tagged release, build the app first, then run `makepkg` using a copy of the `PKGBUILD` whose `package()` step `cd`s into your local checkout instead of pulling a tagged source — this is exactly how the packaging was validated here:

```bash
npm ci && npm run build && npx electron-builder --linux dir --x64
# then makepkg using the package() logic above against ./release/linux-unpacked
```

### AppImage (any modern x86_64 distro) — the one that's been fully run end to end

```bash
npm ci
npm run build
npm run package:appimage
# → release/Auralis-0.1.0.AppImage
chmod +x release/Auralis-0.1.0.AppImage
./release/Auralis-0.1.0.AppImage
```

This one was built and actually run, not just configured — it launches, shows the splash, and loads the real Apple Music page with no crash and no missing files.

To put it in your app launcher (adds it to `~/.local/bin` plus a desktop entry, no root needed):

```bash
./scripts/install-appimage.sh release/Auralis-0.1.0.AppImage
```

### Debian / Ubuntu (.deb)

```bash
npm ci
npm run build
npm run package:deb
sudo apt install ./release/auralis_0.1.0_amd64.deb
```

Like the Arch `pacman` target, this goes through `electron-builder`'s `fpm` dependency, and `fpm`'s download hung in this sandboxed session, so it wasn't possible to verify `.deb` end to end here. GitHub Actions runners tend to have far less restricted network access, so `.github/workflows/ci.yml` still builds it there, and its real pass/fail will show up on the Actions tab once this is pushed. Until you've checked that, treat `.deb` as unverified rather than working.

### From source (any distro with Node.js 20+)

```bash
git clone https://github.com/gautham-sai05/Auralis.git
cd Auralis
npm ci
npm run build
npm start
```

## Running on Arch Linux with Hyprland

Auralis doesn't assume anything about your compositor. On Hyprland:

```bash
npm ci && npm run build && npm start
# or, once packaged:
./release/Auralis-0.1.0.AppImage
```

The tray icon needs a status bar with a systray module to show up (`waybar`'s `tray` module, for example) — without one, the icon just won't be visible anywhere, but the app window itself is unaffected.

## Uninstalling

- Arch (pacman): `sudo pacman -R auralis`
- Debian/Ubuntu (apt): `sudo apt remove auralis`
- AppImage: delete the `.AppImage` file — it's fully self-contained.
- Config and session data live under `~/.config/Auralis` (Electron's default `userData` path) and can be deleted separately for a clean sign-out.

## Development

```bash
npm ci
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint
npm test            # node:test unit tests (electron/*.test.ts)
npm start           # build + launch
```

## Known limitations

- No custom native library/browse UI — see the explanation above.
- No Hi-Res/Lossless audio — an Apple platform limitation, not something fixable client-side.
- MPRIS next/previous controls rely on Apple's page markup and could silently stop working if Apple changes it.
- No offline downloads — not exposed by the web player.
- No lyrics — not reliably exposed by the web player's DOM in any way this session had time to verify.

## License

MIT — see [LICENSE](LICENSE).
