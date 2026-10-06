import type { BrowserWindow } from 'electron';
import type { EqualizerPreset } from './settings.js';

// Bass/mid/treble gain in dB per preset. Deliberately mild (±6dB max) rather
// than aggressive — this runs on a real user's actual playback, not a
// sandbox, and a subtle EQ that's safe is better than a dramatic one that
// clips or distorts on unknown source material.
const EQ_GAINS: Record<EqualizerPreset, [bass: number, mid: number, treble: number]> = {
  flat: [0, 0, 0],
  bassBoost: [6, 0, -1],
  trebleBoost: [-1, 0, 6],
  vocalBoost: [-2, 4, -1],
};

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
  setEqualizer(preset: EqualizerPreset): void;
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
    // Strictly opt-in: this never runs unless a user explicitly picks a
    // preset from the tray. Wrapping an <audio> element in a Web Audio
    // graph is a one-way door for that element (there's no official way to
    // hand it back to plain, unprocessed output), so this only does it once
    // per element and reuses the same context/filter chain afterward rather
    // than re-wrapping on every call. Could not be verified against a real,
    // signed-in, actively-playing track in this sandbox — see the README.
    setEqualizer(preset: EqualizerPreset): void {
      const [bass, mid, treble] = EQ_GAINS[preset];
      run(
        win,
        `(function(){
          var BASS=${bass}, MID=${mid}, TREBLE=${treble};
          var a=document.querySelector('audio,video');
          if(!a) return;
          try {
            if(!window.__auralisEQ || window.__auralisEQEl !== a){
              var Ctx = window.AudioContext || window.webkitAudioContext;
              if(!Ctx) return;
              var ctx = window.__auralisEQCtx || new Ctx();
              window.__auralisEQCtx = ctx;
              var src = ctx.createMediaElementSource(a);
              var bassF = ctx.createBiquadFilter(); bassF.type='lowshelf'; bassF.frequency.value=200;
              var midF = ctx.createBiquadFilter(); midF.type='peaking'; midF.frequency.value=1000; midF.Q.value=0.8;
              var trebleF = ctx.createBiquadFilter(); trebleF.type='highshelf'; trebleF.frequency.value=4000;
              src.connect(bassF); bassF.connect(midF); midF.connect(trebleF); trebleF.connect(ctx.destination);
              window.__auralisEQEl = a;
              window.__auralisEQ = { bass: bassF, mid: midF, treble: trebleF };
              if (ctx.state === 'suspended') ctx.resume();
            }
            window.__auralisEQ.bass.gain.value = BASS;
            window.__auralisEQ.mid.gain.value = MID;
            window.__auralisEQ.treble.gain.value = TREBLE;
          } catch (e) { /* leave audio untouched if anything goes wrong */ }
        })();`,
      );
    },
  };
}
