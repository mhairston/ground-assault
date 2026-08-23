import { CONFIG, W } from '../config.js';
import { relX } from '../core/geometry.js';
import { ONE_SHOTS, LOOPS } from './voices.js';
import { DrumMachine } from './DrumMachine.js';

// ==== The game's one audio interface ============================================================
//
// Everything the game plays goes through play() / startLoop() / stopLoop(). Callers pass a WORLD x
// and the manager works out where that is on screen and pans accordingly, so no call site has to
// know anything about the camera or about audio at all.
//
// Two things this class exists to guarantee:
//
// 1. It is always safe to call. With no Web Audio available — the headless test harness, an old
//    browser, a context the user never unlocked — every method is a silent no-op. Audio must never
//    be able to break the game, so there are no throws and no callers checking first.
// 2. Nothing stacks up. Rapid-fire events (a burst of laser shots, a building shedding a dozen
//    fragments) are capped per sound, and events tied to continuous motion (footsteps, ladder ticks,
//    civilian yelps) have a minimum spacing. Without both, a firefight clips into distortion.
//
// Signal path: voice -> panner -> category bus -> master -> speakers. Muting rides the master, so it
// silences music and effects together while leaving every individual level untouched underneath.
export class SoundManager {
  constructor(camera){
    this.camera = camera;
    this.ctx = null;
    this.buses = null;
    this.music = null;
    this.muted = CONFIG.audio.startMuted;
    this.loops = new Map();     // key -> live loop handle
    this.voices = new Map();    // sound id -> end times of the voices currently sounding
    this.lastPlayed = new Map(); // sound id -> when it last fired, for minGap
    // set once the game is over (see Game.loseLife) to block every NEW sound from that point on, per
    // Mike's request that all audio stop until the game is restarted — the world keeps simulating
    // after GAME OVER (bombs still land, roamers still die), and without this every one of those kept
    // triggering fresh one-shots and ambient loops right through the GAME OVER screen. Deliberately
    // doesn't touch anything already playing: the GAME OVER stinger and the music's fade-out are
    // triggered before this flips, so they're heard out rather than cut off mid-note.
    this.locked = false;
  }

  get enabled(){ return this.ctx !== null && !this.muted; }

  // Browsers won't let a page make noise until the user has interacted with it, so the context is
  // built on the first keypress instead of at load. Safe to call on every keypress: it builds once,
  // and thereafter only nudges a context the browser may have suspended (tab switch, idle).
  unlock(){
    if(this.ctx){
      if(this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Ctor) return; // no Web Audio here — every method below stays a no-op for the rest of the run
    this.ctx = new Ctor();

    const master = this.ctx.createGain();
    master.gain.value = this.muted ? 0 : CONFIG.audio.masterVolume;
    master.connect(this.ctx.destination);
    const bus = volume => {
      const g = this.ctx.createGain();
      g.gain.value = volume;
      g.connect(master);
      return g;
    };
    this.buses = {
      master,
      sfx: bus(CONFIG.audio.sfxVolume),
      ambient: bus(CONFIG.audio.ambientVolume),
      ui: bus(CONFIG.audio.uiVolume),
      music: bus(CONFIG.audio.musicVolume),
    };
    this.music = new DrumMachine(this.ctx, this.buses.music);
  }

  // Suspends/resumes the whole audio graph, sample-accurately, so a paused game goes fully silent —
  // engine hum, drones, whistles, the drum track — and picks back up exactly where it left off rather
  // than needing every loop and scheduler to know about pause separately.
  pause(){ if(this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume(){ if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute(){
    this.muted = !this.muted;
    if(this.ctx){
      const t = this.ctx.currentTime;
      // a short ramp rather than a jump — cutting a gain to zero instantly pops
      this.buses.master.gain.setTargetAtTime(this.muted ? 0 : CONFIG.audio.masterVolume, t, 0.03);
    }
    return this.muted;
  }

  // ---- one-shots -------------------------------------------------------------------------------
  // x is a WORLD x. Omit it for sounds that aren't anywhere in particular (UI, the player's own
  // actions) and they play centred at full volume.
  play(id, { x = null, gain = 1 } = {}){
    if(!this.enabled || this.locked) return;
    const voice = ONE_SHOTS[id];
    if(!voice) return; // unknown id: silently ignored, never a crash in the middle of a firefight
    const now = this.ctx.currentTime;

    if(voice.minGap){
      const last = this.lastPlayed.get(id) ?? -Infinity;
      if(now - last < voice.minGap) return;
    }
    const place = this._place(x);
    if(!place) return; // too far outside the viewport to be worth hearing
    if(!this._takeVoice(id, voice.maxVoices ?? CONFIG.audio.maxVoicesPerSound, voice.dur, now)) return;

    this.lastPlayed.set(id, now);
    voice.render(this.ctx, this._panned(place.pan, voice.bus), { gain: gain*place.gain });
  }

  // ---- loops -----------------------------------------------------------------------------------
  // `key` lets several instances of one voice run at once (a whistle per falling bomb); it defaults
  // to the voice id for the single-instance loops. Starting an already-running key does nothing, so
  // callers can call this every frame without tracking state themselves.
  startLoop(id, key = id){
    if(!this.ctx || this.locked || this.loops.has(key)) return;
    const loop = LOOPS[id];
    if(!loop) return;
    let dest = this.buses[loop.bus];
    let panner = null;
    // a loop belonging to a thing at a place in the world (the whistle of one particular falling
    // bomb) gets its own panner, updated by setLoop as it moves; the rest are non-diegetic and sit
    // centred — the ship's own engine has no business panning away from the player
    if(loop.panned && this.ctx.createStereoPanner){
      panner = this.ctx.createStereoPanner();
      panner.connect(dest);
      dest = panner;
    }
    this.loops.set(key, { handle: loop.start(this.ctx, dest), panner });
  }

  stopLoop(key){
    const entry = this.loops.get(key);
    if(!entry) return;
    entry.handle.stop();
    this.loops.delete(key);
  }

  // per-frame parameter update — pitch following speed, drone level following enemy count, and so
  // on. Pass an `x` and a panned loop follows it across the stereo field and fades with distance.
  setLoop(key, params){
    const entry = this.loops.get(key);
    if(!entry) return;
    if(entry.panner && params.x !== undefined){
      const place = this._place(params.x);
      entry.panner.pan.setTargetAtTime(place ? place.pan : 0, this.ctx.currentTime, 0.05);
      params = { ...params, gain: place ? place.gain : 0 };
    }
    entry.handle.set(params);
  }

  // a loop that should only run while some condition holds: one call handles start, stop and update
  loopWhile(id, active, params = {}, key = id){
    if(!this.ctx) return;
    if(active){ this.startLoop(id, key); this.setLoop(key, params); }
    else this.stopLoop(key);
  }

  stopAllLoops(){
    for(const key of [...this.loops.keys()]) this.stopLoop(key);
  }

  // ---- music -----------------------------------------------------------------------------------
  startMusic(){ this.music?.start(); }
  stopMusic(fade = 0){ this.music?.stop(fade); }
  duckMusic(seconds){ this.music?.duck(seconds); }
  setMusicWave(wave){ this.music?.setWave(wave); }
  setMusicShipMoving(moving){ this.music?.setShipMoving(moving); }

  // ---- internals -------------------------------------------------------------------------------
  // Where a world x sits in the stereo field, and how loud. Panning is screen-relative: an object at
  // the edge of the viewport is panned hard to that side whatever the window width, which is much
  // more dramatic than scaling across the whole 4800px world (where everything on screen would sit
  // near centre). Past the edge a sound fades out over audibleMargin rather than cutting off, so
  // something flying out of view recedes instead of vanishing. Returns null once it's out of range.
  _place(worldX){
    if(worldX === null || worldX === undefined) return { pan: 0, gain: 1 };
    const half = W/2;
    const offset = (relX(this.camera.x, worldX) - half) / half; // -1 at the left edge, +1 at the right
    const beyond = (Math.abs(offset) - 1) * half;               // px past the edge, negative when on screen
    if(beyond > CONFIG.audio.audibleMargin) return null;
    const pan = Math.max(-1, Math.min(1, offset)) * CONFIG.audio.panStrength;
    const fade = beyond <= 0 ? 1
      : 1 - (beyond/CONFIG.audio.audibleMargin)*(1 - CONFIG.audio.edgeVolume);
    return { pan, gain: fade };
  }

  _panned(pan, busName){
    const bus = this.buses[busName] ?? this.buses.sfx;
    // StereoPannerNode is the cheap constant-power panner; Safari didn't always have it, so fall
    // back to the bus unpanned rather than losing the sound entirely
    if(!this.ctx.createStereoPanner) return bus;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(bus);
    return panner;
  }

  // Concurrency cap. Rather than tracking node lifetimes with callbacks, each voice records when it
  // will have finished; expired entries are dropped on the next attempt. Cheap, and self-cleaning.
  _takeVoice(id, cap, dur, now){
    const live = (this.voices.get(id) ?? []).filter(end => end > now);
    if(live.length >= cap){
      this.voices.set(id, live);
      return false;
    }
    live.push(now + dur);
    this.voices.set(id, live);
    return true;
  }
}
