import type { BrowserWindow } from 'electron';

// The underlying <audio>/<video> element is a real, directly addressable DOM
// node with a standard API (.volume, .currentTime, .paused), so volume and
// seeking can be set precisely. Transport (play/pause/next/previous) has no
// such element-level equivalent and has to go through Apple's own on-page
// buttons via their accessibility labels — inherently best-effort, since it
// depends on Apple's markup rather than a stable API.
export interface PlayerControl {
  playPause(): void;
  next(): void;
  previous(): void;
  seekRelative(offsetSeconds: number): void;
  setPosition(seconds: number): void;
  setVolume(volume: number): void;
  adjustVolume(delta: number): void;
}

function run(win: BrowserWindow, script: string): void {
  void win.webContents.executeJavaScript(script).catch(() => undefined);
}

export function createPlayerControl(win: BrowserWindow): PlayerControl {
  return {
    playPause(): void {
      run(
        win,
        `(function(){var a=document.querySelector('audio,video');if(a){a.paused?a.play():a.pause();return;}var b=document.querySelector('[aria-label="Play"],[aria-label="Pause"]');if(b)b.click();})();`,
      );
    },
    next(): void {
      run(win, `(function(){var b=document.querySelector('[aria-label="Next"]');if(b)b.click();})();`);
    },
    previous(): void {
      run(win, `(function(){var b=document.querySelector('[aria-label="Previous"]');if(b)b.click();})();`);
    },
    seekRelative(offsetSeconds: number): void {
      run(
        win,
        `(function(){var a=document.querySelector('audio,video');if(a)a.currentTime=Math.max(0,a.currentTime+(${offsetSeconds}));})();`,
      );
    },
    setPosition(seconds: number): void {
      const clamped = Math.max(0, seconds);
      run(win, `(function(){var a=document.querySelector('audio,video');if(a)a.currentTime=${clamped};})();`);
    },
    setVolume(volume: number): void {
      const clamped = Math.max(0, Math.min(1, volume));
      run(win, `(function(){var a=document.querySelector('audio,video');if(a)a.volume=${clamped};})();`);
    },
    adjustVolume(delta: number): void {
      run(
        win,
        `(function(){var a=document.querySelector('audio,video');if(a)a.volume=Math.max(0,Math.min(1,a.volume+(${delta})));})();`,
      );
    },
  };
}
