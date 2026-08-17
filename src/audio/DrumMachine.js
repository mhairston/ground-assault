import { CONFIG } from '../config.js';
import { DRUMS } from './voices.js';

// The background rhythm track: a 16-step drum pattern played by scheduling short synthesised hits
// ahead of the audio clock. No loop buffer, so tempo and pattern can change mid-game without
// reloading anything (see CONFIG.audio.music — the four voice rows are plain 16-character strings).
//
// Why a lookahead scheduler rather than one timer per beat: setTimeout drifts by tens of
// milliseconds under load, which is instantly audible as a wobbling beat, while AudioContext's
// clock is sample-accurate. So a coarse timer wakes up often (tickInterval) and schedules every hit
// falling in the next slice (lookahead) at an exact audio-clock time. The timer being late by a few
// ms then costs nothing — the hits were already booked. This is the standard Web Audio clock
// pattern, and the reason the beat stays tight through a frame-rate hitch.
export class DrumMachine {
  constructor(ctx, dest){
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(dest);
    this.running = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.bpm = CONFIG.audio.music.bpm;
    this.duckUntil = 0;
  }

  get stepDuration(){ return 60 / this.bpm / 4; } // a sixteenth note

  start(){
    if(this.running || !CONFIG.audio.music.enabled) return;
    this.running = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.timer = setInterval(() => this._schedule(), CONFIG.audio.music.tickInterval*1000);
    this._schedule();
  }

  // fadeSeconds so GAME OVER can bleed the drums away rather than dropping them mid-bar
  stop(fadeSeconds = 0){
    if(!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, fadeSeconds));
  }

  // Silence the kit for a moment without stopping the sequencer, so the wave-complete fanfare has
  // the room to itself and the beat picks up exactly where it would have been rather than restarting.
  duck(seconds){
    if(!this.running) return;
    const t = this.ctx.currentTime;
    this.duckUntil = t + seconds;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0.0001, t, 0.05);
    this.gain.gain.setTargetAtTime(1, t + seconds, 0.2);
  }

  // wave number -> tempo, from CONFIG.audio.music.tempoSteps. Changing bpm only affects hits not yet
  // scheduled, so the current bar finishes at the old tempo instead of lurching.
  setWave(wave){
    let bpm = CONFIG.audio.music.bpm;
    for(const [fromWave, stepBpm] of CONFIG.audio.music.tempoSteps) if(wave >= fromWave) bpm = stepBpm;
    this.bpm = bpm;
  }

  _schedule(){
    const music = CONFIG.audio.music;
    const horizon = this.ctx.currentTime + music.lookahead;
    while(this.running && this.nextStepTime < horizon){
      this._playStep(this.step, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.step = (this.step + 1) % 16;
    }
  }

  _playStep(step, when){
    const m = CONFIG.audio.music;
    if(m.kick[step]      === 'X') DRUMS.kick(this.ctx, this.gain, when, m.kickVolume);
    if(m.snare[step]     === 'X') DRUMS.snare(this.ctx, this.gain, when, m.snareVolume);
    if(m.hatOpen[step]   === 'X') DRUMS.hatOpen(this.ctx, this.gain, when, m.hatOpenVolume);
    // an open hat on the same step would just be masked by the closed one, so they're exclusive
    else if(m.hatClosed[step] === 'X') DRUMS.hatClosed(this.ctx, this.gain, when, m.hatClosedVolume);
  }
}
