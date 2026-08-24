import { CONFIG } from '../config.js';

// ==== Voice recipes: what every sound in the game actually IS ====================================
//
// Two tables live here. ONE_SHOTS are fire-and-forget — the manager builds a panner and a bus for
// them, calls render(), and forgets about them; the nodes stop themselves. LOOPS are continuous and
// have a lifecycle: start() returns a handle with set() (to follow game state, e.g. engine pitch
// tracking ship speed) and stop() (which fades rather than cutting, so a loop never clicks off).
//
// Waveform choices, filter cutoffs and envelope times are art direction — the audio equivalent of
// the colors and pixel offsets the CONFIG header keeps out of CONFIG — so they live here next to the
// sound they describe. Mix levels, rate limits and anything a player would notice as *behaviour* are
// in CONFIG.audio.
//
// Every voice must be cheap: these fire dozens of times a second during a firefight.

// One noise buffer per context, shared by every noise-based voice — a second of white noise is
// ~180KB, and rebuilding it per shot would be the single most expensive thing in the audio path.
const noiseBuffers = new WeakMap();
function noiseBuffer(ctx){
  let buf = noiseBuffers.get(ctx);
  if(!buf){
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = Math.random()*2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

// exponential ramps can't touch zero, so silence is this rather than 0 everywhere below
const SILENT = 0.0001;
const safe = v => Math.max(SILENT, v);

// A pitched blip. `to` sweeps the frequency across the life of the note (up for rising chimes, down
// for falling ones); leaving it out holds a steady pitch.
export function tone(ctx, dest, { type='sine', from=440, to=from, dur=0.15, gain=0.2, attack=0.005, delay=0 }){
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(safe(from), t);
  if(to !== from) osc.frequency.exponentialRampToValueAtTime(safe(to), t + dur);
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(safe(gain), t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t); osc.stop(t + dur + 0.02);
}

// A filtered noise burst — every percussive sound in the game (explosions, thuds, hisses, the whole
// drum kit) is this with different filter settings. Sweeping the cutoff is what turns flat static
// into something with weight: down for a thump, up for a hiss.
export function noise(ctx, dest, { dur=0.2, gain=0.2, filter='lowpass', from=1200, to=from, Q=1, attack=0.004, delay=0 }){
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.Q.value = Q;
  f.frequency.setValueAtTime(safe(from), t);
  if(to !== from) f.frequency.exponentialRampToValueAtTime(safe(to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(safe(gain), t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + dur + 0.02);
}

// plays a sequence of [semitoneOffset, startTime, duration] notes against a root — the musical
// sounds (chimes, fanfares, tolls) are all this
const semi = (root, n) => root * Math.pow(2, n/12);
function melody(ctx, dest, { root=440, notes=[], type='triangle', gain=0.2, noteDur=0.12 }){
  for(const [step, at, dur] of notes){
    tone(ctx, dest, { type, from: semi(root, step), dur: dur ?? noteDur, gain, delay: at, attack: 0.008 });
  }
}

function explosionConfig(id){
  const cfg = CONFIG.audio.explosions?.[id] ?? {};
  return {
    frequency: Math.max(30, cfg.frequency ?? 170),
    duration: Math.max(0.06, cfg.duration ?? 0.3),
    volume: Math.max(0, cfg.volume ?? 1),
  };
}

// Shared explosion voicing: a sharp initial crack plus a low rumbling tail, based on the
// kamikazeCollision character. Each sound id tunes this shape with CONFIG.audio.explosions.*.
// The cry a civilian gives when a roamer grabs them. Shared by `capture` and `civilianYelp` in the
// table below, which are the same sound and differ only in how many of them may sound at once — see
// the comment on civilianYelp. Kept as one function so the two can never drift apart.
function abductionCry(ctx, dest, o){
  tone(ctx, dest, { type:'sawtooth', from:900, to:180, dur:0.22, gain:0.2*o.gain });
  tone(ctx, dest, { type:'sine', from:450, to:90, dur:0.24, gain:0.12*o.gain });
}

function collisionStyleExplosion(ctx, dest, o, id, { brightness=1, crack=1, tail=1 } = {}){
  const cfg = explosionConfig(id);
  const jitter = (amt = 0.1) => 1 + (Math.random()*2 - 1)*amt;
  const base = cfg.frequency * jitter(0.12);
  const dur = cfg.duration * jitter(0.1);
  const level = o.gain * cfg.volume;
  const crackDur = Math.min(0.45, Math.max(0.06, dur * 0.25));
  const tailDur = Math.max(0.07, dur * tail);
  const bright = brightness * jitter(0.12);
  const crackGain = crack * jitter(0.15);
  const tailGain = jitter(0.18);

  noise(ctx, dest, {
    dur: crackDur,
    gain: 0.42 * crackGain * level,
    filter: 'lowpass',
    from: base * 26 * bright,
    to: base * 1.05,
    Q: 1.8,
  });
  tone(ctx, dest, {
    type: 'sawtooth',
    from: base * 1.05,
    to: base * 0.19,
    dur: crackDur,
    gain: 0.24 * crackGain * level,
  });

  tone(ctx, dest, {
    type: 'square',
    from: base * 1.8,
    to: base * 0.35,
    dur: Math.max(0.05, crackDur * 0.8),
    gain: 0.08 * crackGain * level,
  });

  noise(ctx, dest, {
    dur: tailDur,
    gain: 0.24 * tailGain * level,
    filter: 'lowpass',
    from: base * 6,
    to: base * 0.14,
    Q: 1,
    attack: 0.045,
  });
  tone(ctx, dest, {
    type: 'sawtooth',
    from: base * 0.52,
    to: base * 0.1,
    dur: Math.max(0.06, tailDur * 0.9),
    gain: 0.11 * tailGain * level,
    attack: 0.045,
  });

  tone(ctx, dest, {
    type: 'sine',
    from: base * 0.18,
    to: base * 0.06,
    dur: Math.max(0.08, tailDur),
    gain: 0.06 * tailGain * level,
    attack: 0.07,
  });
}

// ---- one-shots ---------------------------------------------------------------------------------
// bus: which sub-mix it belongs to (sfx / ui / ambient). dur: roughly how long it occupies a voice
// slot, used for the concurrency cap. minGap: the shortest allowed spacing between two of these,
// for sounds attached to something that repeats fast.
export const ONE_SHOTS = {
  // --- ship: flight ---
  takeoff: { bus:'ui', dur:0.42, render:(ctx,d,o)=>
    melody(ctx, d, { root:440, type:'sine', gain:0.22*o.gain, notes:[[0,0,0.14],[7,0.11,0.22]] }) },
  landing: { bus:'ui', dur:0.42, render:(ctx,d,o)=>
    melody(ctx, d, { root:440, type:'sine', gain:0.22*o.gain, notes:[[7,0,0.14],[0,0.11,0.22]] }) },

  // --- ship: weapons ---
  // the classic Defender pew: a square wave dropping fast, over in 80ms
  laser: { bus:'sfx', dur:0.09, maxVoices:6, render:(ctx,d,o)=>
    tone(ctx, d, { type:'square', from:880, to:300, dur:0.08, gain:0.13*o.gain }) },
  burstCooldown: { bus:'ui', dur:0.06, render:(ctx,d,o)=>
    noise(ctx, d, { dur:0.05, gain:0.06*o.gain, filter:'lowpass', from:900, to:300 }) },
  // the biggest sound in the game, now in the same sonic family as kamikazeCollision but bigger
  superbomb: { bus:'sfx', dur:CONFIG.audio.explosions.superbomb.duration, maxVoices:1, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'superbomb', { brightness: 1.35, crack: 1.65, tail: 1.2 }) },
  // ...and bigger still: the ship going into a building. Same family, tuned darker and with the
  // longest tail of anything in the game, since it plays under a slow-motion explosion. maxVoices:1
  // because there is exactly one of these at a time by construction — the ship is destroyed by it.
  shipCrash: { bus:'sfx', dur:CONFIG.audio.explosions.shipCrash.duration, maxVoices:1, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'shipCrash', { brightness: 1.15, crack: 1.8, tail: 1.5 }) },

  // --- on foot ---
  footstep: { bus:'sfx', dur:0.07, minGap:CONFIG.audio.footstepGap, render:(ctx,d,o)=>
    noise(ctx, d, { dur:0.06, gain:0.1*o.gain, filter:'lowpass', from:420, to:150 }) },
  climbTick: { bus:'sfx', dur:0.05, minGap:CONFIG.audio.climbTickGap, render:(ctx,d,o)=>
    noise(ctx, d, { dur:0.04, gain:0.07*o.gain, filter:'bandpass', from:2600, Q:6 }) },
  // same family as the ship's laser but pitched down — on foot you're firing something cruder
  footLaser: { bus:'sfx', dur:0.1, maxVoices:4, render:(ctx,d,o)=>
    tone(ctx, d, { type:'square', from:560, to:190, dur:0.09, gain:0.12*o.gain }) },
  board: { bus:'ui', dur:0.3, render:(ctx,d,o)=>{
    tone(ctx, d, { type:'triangle', from:330, to:660, dur:0.12, gain:0.18*o.gain });
    noise(ctx, d, { dur:0.09, gain:0.16*o.gain, filter:'lowpass', from:500, to:120, delay:0.08 });
  }},
  disembark: { bus:'ui', dur:0.3, render:(ctx,d,o)=>{
    tone(ctx, d, { type:'triangle', from:660, to:330, dur:0.12, gain:0.18*o.gain });
    noise(ctx, d, { dur:0.09, gain:0.16*o.gain, filter:'lowpass', from:500, to:120, delay:0.08 });
  }},

  // --- roamers ---
  // buzzier and mid-pitched, so it reads as "not yours" even at the same volume as your own fire
  roamerShot: { bus:'sfx', dur:0.12, maxVoices:5, render:(ctx,d,o)=>
    tone(ctx, d, { type:'sawtooth', from:420, to:240, dur:0.11, gain:0.11*o.gain }) },
  // the Defender abduction alarm: an unsettling glide downward
  capture: { bus:'sfx', dur:0.26, maxVoices:2, render:abductionCry },
  roamerDeath: { bus:'sfx', dur:CONFIG.audio.explosions.roamerDeath.duration, maxVoices:4, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'roamerDeath', { brightness: 1.18, crack: 1.05, tail: 0.85 }) },
  // a hit that doesn't finish the job — a bomber takes two, per Mike's request. Sharper and much
  // shorter than bomberDeath below, so the two are tellable apart: this one says "hit, but still flying".
  bomberHit: { bus:'sfx', dur:CONFIG.audio.explosions.bomberHit.duration, maxVoices:4, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'bomberHit', { brightness: 1.65, crack: 0.95, tail: 0.6 }) },
  // same crack as a roamer, pitched down so the two are tellable apart in a crowded fight
  bomberDeath: { bus:'sfx', dur:CONFIG.audio.explosions.bomberDeath.duration, maxVoices:4, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'bomberDeath', { brightness: 1.0, crack: 1.2, tail: 1.0 }) },
  // a small detonation rather than a plain crack — lowpass noise burst like a bomb impact, since a
  // kamikaze goes out with a bang, not a whimper
  kamikazeDeath: { bus:'sfx', dur:CONFIG.audio.explosions.kamikazeDeath.duration, maxVoices:4, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'kamikazeDeath', { brightness: 1.2, crack: 1.2, tail: 1.0 }) },
  // two kamikazes meeting head-on, per Mike's request — a real boom, noticeably bigger than a single
  // kamikazeDeath, in the same weight class as buildingCollapse
  // long duration by default (3s) so it can ring out while debris lingers; tune in
  // CONFIG.audio.explosions.kamikazeCollision.duration
  kamikazeCollision: { bus:'sfx', dur:CONFIG.audio.explosions.kamikazeCollision.duration, maxVoices:2, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'kamikazeCollision', { brightness: 1.35, crack: 1.35, tail: 1.15 }) },

  // --- bombs ---
  bombDrop: { bus:'sfx', dur:0.16, maxVoices:3, render:(ctx,d,o)=>
    tone(ctx, d, { type:'sine', from:700, to:260, dur:0.14, gain:0.07*o.gain }) },
  bombHitBuilding: { bus:'sfx', dur:CONFIG.audio.explosions.bombHitBuilding.duration, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'bombHitBuilding', { brightness: 0.92, crack: 1.08, tail: 1.0 }) },
  // duller and less resonant than a building hit — soil rather than concrete
  bombHitGround: { bus:'sfx', dur:CONFIG.audio.explosions.bombHitGround.duration, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'bombHitGround', { brightness: 0.7, crack: 0.95, tail: 0.95 }) },
  // a reward, so it's bright and short where every other bomb sound is low and heavy
  bombIntercept: { bus:'sfx', dur:0.18, maxVoices:3, render:(ctx,d,o)=>
    melody(ctx, d, { root:1046, type:'sine', gain:0.16*o.gain, notes:[[0,0,0.07],[7,0.05,0.11]] }) },

  // --- buildings ---
  buildingHit: { bus:'sfx', dur:CONFIG.audio.explosions.buildingHit.duration, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'buildingHit', { brightness: 1.45, crack: 0.88, tail: 0.55 }) },
  // the loudest, longest thing that isn't a superbomb — 64 fragments deserve a tail
  buildingCollapse: { bus:'sfx', dur:CONFIG.audio.explosions.buildingCollapse.duration, maxVoices:2, render:(ctx,d,o)=>
    collisionStyleExplosion(ctx, d, o, 'buildingCollapse', { brightness: 1.1, crack: 1.45, tail: 1.25 }) },
  suppressant: { bus:'sfx', dur:0.7, render:(ctx,d,o)=>{
    noise(ctx, d, { dur:0.4, gain:0.16*o.gain, filter:'highpass', from:3000, to:6000 });
    melody(ctx, d, { root:784, type:'sine', gain:0.16*o.gain, notes:[[0,0.34,0.22]] });
  }},

  // --- civilians ---
  civilianDanger: { bus:'sfx', dur:0.14, minGap:CONFIG.audio.civilianYelpGap, maxVoices:1, render:(ctx,d,o)=>
    tone(ctx, d, { type:'triangle', from:1200, to:1650, dur:0.1, gain:0.11*o.gain }) },
  civilianRescued: { bus:'ui', dur:0.32, render:(ctx,d,o)=>
    melody(ctx, d, { root:659, type:'sine', gain:0.2*o.gain, notes:[[0,0,0.12],[5,0.1,0.2]] }) },
  civilianSafe: { bus:'sfx', dur:0.1, render:(ctx,d,o)=>
    noise(ctx, d, { dur:0.07, gain:0.1*o.gain, filter:'lowpass', from:1100, to:380 }) },
  // Exactly the cry above, per Mike's request that a civilian falling out of a collapsing building
  // sound like one being abducted. It has its own id purely for concurrency: a collapse throws up to
  // twelve of these into the air within a second or two, and capture's 2-voice cap — right for
  // abductions, which arrive one at a time — would silently swallow most of them, which is the one
  // thing this must not do when the request is that EACH of them yelps. Same recipe either way.
  civilianYelp: { bus:'sfx', dur:0.26, maxVoices:6, render:abductionCry },
  civilianLost: { bus:'sfx', dur:0.3, maxVoices:2, render:(ctx,d,o)=>
    melody(ctx, d, { root:392, type:'triangle', gain:0.16*o.gain, notes:[[3,0,0.14],[-2,0.12,0.2]] }) },

  // --- pickups: same arpeggio for both, the root telling them apart ---
  pickupSuperbomb: { bus:'ui', dur:0.34, render:(ctx,d,o)=>
    melody(ctx, d, { root:392, type:'square', gain:0.13*o.gain, notes:[[0,0,0.08],[4,0.07,0.08],[7,0.14,0.18]] }) },
  pickupSuppressant: { bus:'ui', dur:0.34, render:(ctx,d,o)=>
    melody(ctx, d, { root:587, type:'square', gain:0.13*o.gain, notes:[[0,0,0.08],[4,0.07,0.08],[7,0.14,0.18]] }) },

  // --- score / UI: the only sounds that are deliberately musical ---
  waveComplete: { bus:'ui', dur:1.2, render:(ctx,d,o)=>{
    melody(ctx, d, { root:523, type:'triangle', gain:0.2*o.gain,
      notes:[[0,0,0.12],[4,0.12,0.12],[7,0.24,0.12],[12,0.36,0.5]] });
    melody(ctx, d, { root:523, type:'sine', gain:0.12*o.gain, notes:[[4,0.36,0.5],[7,0.36,0.5]] });
  }},
  shipLost: { bus:'ui', dur:0.6, render:(ctx,d,o)=>
    melody(ctx, d, { root:440, type:'triangle', gain:0.2*o.gain, notes:[[0,0,0.16],[-3,0.15,0.16],[-8,0.3,0.3]] }) },
  gameOver: { bus:'ui', dur:1.6, render:(ctx,d,o)=>
    melody(ctx, d, { root:440, type:'sawtooth', gain:0.17*o.gain,
      notes:[[0,0,0.18],[-2,0.16,0.18],[-5,0.32,0.18],[-9,0.48,0.22],[-14,0.68,0.9]] }) },
  restart: { bus:'ui', dur:0.26, render:(ctx,d,o)=>
    melody(ctx, d, { root:523, type:'square', gain:0.16*o.gain, notes:[[0,0,0.08],[7,0.07,0.16]] }) },
};

// ---- loops -------------------------------------------------------------------------------------
// start() returns { set(params), stop() }. set() is called every frame with whatever the loop tracks,
// and must be cheap and glitch-free — hence setTargetAtTime everywhere rather than direct assignment,
// which would zipper audibly as the value jumps frame to frame.
export const LOOPS = {
  // Low sawtooth drone, pitch following the ship's speed. The thrust "puff" from the plan is folded
  // in here as a noise layer that swells while the keys are held, rather than the plan's literal
  // per-frame one-shot — at 60fps that would be 60 overlapping bursts a second, which is a buzz saw,
  // not texture.
  engine: { bus:'ambient', start(ctx, dest){
    const cfg = CONFIG.audio.engine;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.value = cfg.baseHz;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = SILENT;
    osc.connect(lp).connect(g).connect(dest); osc.start();

    const puff = ctx.createBufferSource(); puff.buffer = noiseBuffer(ctx); puff.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.8;
    const pg = ctx.createGain(); pg.gain.value = SILENT;
    puff.connect(bp).connect(pg).connect(dest); puff.start();

    g.gain.setTargetAtTime(cfg.volume, ctx.currentTime, 0.3); // fades in on takeoff rather than snapping on
    return {
      set({ speedFrac = 0, thrusting = false, gliding = false }){
        const t = ctx.currentTime;
        osc.frequency.setTargetAtTime(cfg.baseHz + cfg.speedHz*speedFrac, t, 0.08);
        // during an auto glide the player isn't flying it — duck the hum so the chime reads clearly
        g.gain.setTargetAtTime(gliding ? cfg.glideVolume : cfg.volume, t, 0.15);
        pg.gain.setTargetAtTime(thrusting && !gliding ? cfg.thrustNoiseVolume : SILENT, t, 0.06);
      },
      stop(){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(SILENT, t, 0.12);
        pg.gain.setTargetAtTime(SILENT, t, 0.12);
        osc.stop(t + 0.8); puff.stop(t + 0.8);
      },
    };
  }},

  // Slow-pulsing triangle that sits under everything — presence rather than a sound you notice. More
  // roamers alive means louder and faster, so the pressure of a wave is audible before it's visible.
  roamerDrone: { bus:'ambient', start(ctx, dest){
    const cfg = CONFIG.audio.roamerDrone;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = cfg.baseHz;
    const g = ctx.createGain(); g.gain.value = SILENT;
    // an LFO on the gain is what makes it pulse; depth is half the level so it breathes, never gates
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = cfg.lfoHz;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(g.gain);
    osc.connect(g).connect(dest);
    osc.start(); lfo.start();
    return {
      set({ count = 0 }){
        const t = ctx.currentTime;
        const level = count > 0 ? cfg.volume + cfg.perRoamer*(count-1) : SILENT;
        g.gain.setTargetAtTime(level, t, 0.4);
        lfoDepth.gain.setTargetAtTime(count > 0 ? level*0.5 : 0, t, 0.4);
        lfo.frequency.setTargetAtTime(cfg.lfoHz + cfg.lfoPerRoamer*Math.max(0,count-1), t, 0.4);
      },
      stop(){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(SILENT, t, 0.2);
        osc.stop(t + 1.0); lfo.stop(t + 1.0);
      },
    };
  }},

  // Higher than the roamer drone and detuned by a second oscillator, so two bombers beat against
  // each other — the wobble is the zig-zag flight path made audible.
  bomberDrone: { bus:'ambient', start(ctx, dest){
    const cfg = CONFIG.audio.bomberDrone;
    const a = ctx.createOscillator(); a.type = 'square'; a.frequency.value = cfg.baseHz;
    const b = ctx.createOscillator(); b.type = 'square'; b.frequency.value = cfg.baseHz;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = SILENT;
    const wobble = ctx.createOscillator(); wobble.type = 'sine'; wobble.frequency.value = cfg.wobbleHz;
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = cfg.wobbleCents;
    wobble.connect(wobbleDepth).connect(b.detune);
    a.connect(lp); b.connect(lp); lp.connect(g).connect(dest);
    a.start(); b.start(); wobble.start();
    return {
      set({ count = 0 }){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(count > 0 ? cfg.volume + cfg.perBomber*(count-1) : SILENT, t, 0.4);
      },
      stop(){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(SILENT, t, 0.2);
        a.stop(t + 1.0); b.stop(t + 1.0); wobble.stop(t + 1.0);
      },
    };
  }},

  // Higher-pitched and faster-pulsing than either of the above, so a kamikaze's presence reads as
  // more urgent — the same triangle-plus-tremolo shape as roamerDrone, just tuned sharper.
  kamikazeDrone: { bus:'ambient', start(ctx, dest){
    const cfg = CONFIG.audio.kamikazeDrone;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = cfg.baseHz;
    const g = ctx.createGain(); g.gain.value = SILENT;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = cfg.lfoHz;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(g.gain);
    osc.connect(g).connect(dest);
    osc.start(); lfo.start();
    return {
      set({ count = 0 }){
        const t = ctx.currentTime;
        const level = count > 0 ? cfg.volume + cfg.perKamikaze*(count-1) : SILENT;
        g.gain.setTargetAtTime(level, t, 0.4);
        lfoDepth.gain.setTargetAtTime(count > 0 ? level*0.5 : 0, t, 0.4);
        lfo.frequency.setTargetAtTime(cfg.lfoHz + cfg.lfoPerKamikaze*Math.max(0,count-1), t, 0.4);
      },
      stop(){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(SILENT, t, 0.2);
        osc.stop(t + 1.0); lfo.stop(t + 1.0);
      },
    };
  }},

  // One per bomb in the air, keyed by the bomb itself. Pitch rises as it nears its target, which is
  // the only cue you get that something is about to land on you when it's off the top of the screen.
  bombWhistle: { bus:'ambient', panned:true, start(ctx, dest){
    const cfg = CONFIG.audio.bombWhistle;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = cfg.fromHz;
    const g = ctx.createGain(); g.gain.value = SILENT;
    osc.connect(g).connect(dest); osc.start();
    g.gain.setTargetAtTime(cfg.volume, ctx.currentTime, 0.15);
    return {
      set({ progress = 0, gain = 1 }){
        const t = ctx.currentTime;
        osc.frequency.setTargetAtTime(cfg.fromHz + (cfg.toHz - cfg.fromHz)*progress, t, 0.1);
        g.gain.setTargetAtTime(cfg.volume*gain, t, 0.1);
      },
      stop(){
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(SILENT, t, 0.05);
        osc.stop(t + 0.3);
      },
    };
  }},
};

// the drum kit, exported for DrumMachine — same noise-shaping primitives as everything else
export const DRUMS = {
  kick(ctx, dest, when, gain){
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.06);
    g.gain.setValueAtTime(SILENT, when);
    g.gain.exponentialRampToValueAtTime(safe(gain), when + 0.004);
    g.gain.exponentialRampToValueAtTime(SILENT, when + 0.16);
    osc.connect(g).connect(dest); osc.start(when); osc.stop(when + 0.18);
    scheduledNoise(ctx, dest, when, { dur:0.05, gain:gain*0.5, filter:'lowpass', from:220, to:60 });
  },
  snare(ctx, dest, when, gain){
    scheduledNoise(ctx, dest, when, { dur:0.09, gain, filter:'highpass', from:1400, to:900, Q:1.5 });
  },
  hatClosed(ctx, dest, when, gain){
    scheduledNoise(ctx, dest, when, { dur:0.022, gain, filter:'highpass', from:8000 });
  },
  hatOpen(ctx, dest, when, gain){
    scheduledNoise(ctx, dest, when, { dur:0.15, gain, filter:'highpass', from:7000 });
  },
};

// noise() always fires at currentTime; the sequencer needs to schedule ahead of the clock, so this
// is the same thing with an explicit start time
function scheduledNoise(ctx, dest, when, { dur, gain, filter, from, to=from, Q=1 }){
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = Q;
  f.frequency.setValueAtTime(safe(from), when);
  if(to !== from) f.frequency.exponentialRampToValueAtTime(safe(to), when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, when);
  g.gain.exponentialRampToValueAtTime(safe(gain), when + 0.003);
  g.gain.exponentialRampToValueAtTime(SILENT, when + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(when); src.stop(when + dur + 0.02);
}
