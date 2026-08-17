import { CONFIG, WORLD_W } from '../config.js';
import { wrapX } from '../core/geometry.js';
import { Roamer } from '../entities/Roamer.js';
import { Humanoid } from '../entities/Humanoid.js';

const WAVE_WORDS = ['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN'];

// Roamer waves: wave 1 releases 10 roamers total, each subsequent wave adds 5 more, capped at 45.
// Roamers aren't all released at once — they trickle in 1 at a time early on, ramping up to 3 at a
// time by wave 7. A wave is "cleared" (and the next one begins) once every roamer that belonged to
// it is gone, however that happened — shot down, superbombed, rammed, or successfully escaping off
// the top of the screen with a captive. Bombers are deliberately outside this system entirely:
// they're a persistent, wave-independent threat with no per-wave quota.
export class WaveManager {
  constructor(game){
    this.game = game;
    this.reset();
  }

  static word(n){ return WAVE_WORDS[n] || String(n); }
  static quotaFor(wave){ return Math.min(CONFIG.wave.baseQuota + CONFIG.wave.quotaPerWave*(wave-1), CONFIG.wave.quotaCap); }
  static releaseRateFor(wave){ return Math.min(CONFIG.wave.releaseRateCap, Math.round(1 + (wave-1)/CONFIG.wave.releaseRateDivisor)); }

  reset(){
    this.number = 1;
    this.quota = WaveManager.quotaFor(this.number);
    this.spawned = 0;
    this.resolved = 0;
    this.complete = false;
    this.completeTimer = 0;
    this.statsToShow = null;
    this.civDeaths = 0;
    this.civAbductions = 0;
    // enemies (roamers AND bombers) destroyed while this wave was in progress — bullet, ram, or
    // superbomb kills all count; a roamer escaping off-screen with a captive does NOT (that's an
    // escape, not a destroy). Displayed on the WAVE COMPLETE overlay, per Mike's request.
    this.enemiesDestroyed = 0;
    this.releaseTimer = CONFIG.roamer.initialRespawnTimer;
  }

  get word(){ return WaveManager.word(this.number); }

  recordCivDeath(){ this.civDeaths++; }
  recordCivAbduction(){ this.civAbductions++; }
  recordEnemyDestroyed(n = 1){ if(!this.complete) this.enemiesDestroyed += n; }
  // superbomb kills remove roamers from the array immediately (unlike a bullet kill, which just
  // flags alive=false and lets the next Roamer.updateAll pass count/filter it) — so that path has to
  // credit the resolved count itself, or a superbombed wave could never register as cleared.
  recordResolved(n){ if(!this.complete) this.resolved += n; }

  releaseRoamers(){
    const n = Math.min(WaveManager.releaseRateFor(this.number), this.quota - this.spawned);
    for(let i=0;i<n;i++) Roamer.spawn(this.game);
    this.spawned += n;
  }

  tickRelease(dt){
    if(this.complete || this.spawned >= this.quota) return;
    this.releaseTimer -= dt;
    if(this.releaseTimer <= 0){
      this.releaseRoamers();
      this.releaseTimer = CONFIG.roamer.respawnTimerBase+Math.random()*CONFIG.roamer.respawnTimerRandRange;
    }
  }

  // called once per tick with the (not yet filtered) roamer list — every roamer that died this tick
  // counts toward the wave being cleared
  countResolved(roamers){
    if(this.complete) return;
    this.resolved += roamers.reduce((n,r) => n + (r.alive ? 0 : 1), 0);
  }

  checkComplete(aliveRoamers){
    if(!this.complete && this.spawned >= this.quota && this.resolved >= this.quota && aliveRoamers.length === 0){
      this.triggerComplete();
    }
  }

  triggerComplete(){
    this.complete = true;
    this.statsToShow = { number: this.number, deaths: this.civDeaths, abductions: this.civAbductions, destroyed: this.enemiesDestroyed };
    this.completeTimer = CONFIG.wave.completeOverlayDuration;
    // flat per-wave bonus (Mike specified 500 for wave one; no growth formula was given, so every
    // wave awards the same flat bonus — flag this for confirmation)
    this.game.addScore(CONFIG.wave.completeBonus);
    // the fanfare is the most musical sound in the game, so the drums step aside for it rather than
    // playing underneath — and pick up exactly where they would have been, not from the top of a bar
    this.game.sound.play('waveComplete');
    this.game.sound.duckMusic(CONFIG.audio.music.fanfareDuckSeconds);
    // civilians who sheltered (or were fleeing) during the wave come back out and wander off away
    // from buildings during the lull, per Mike's request — clears safe/fleeing state and picks a
    // direction away from whatever building is nearest, for a few seconds of movement
    for(const h of this.game.humanoids){
      if(!h.alive) continue;
      h.startWanderingAwayFrom(this.game.nearestBuilding(h.x).b);
    }
  }

  updateTransition(dt){
    if(!this.complete) return;
    this.completeTimer -= dt;
    if(this.completeTimer > 0) return;
    this.number++;
    // the drum track speeds up as the waves get harder (CONFIG.audio.music.tempoSteps) — applied at
    // the wave boundary, and only to steps not yet scheduled, so the beat shifts between bars
    this.game.sound.setMusicWave(this.number);
    this.quota = WaveManager.quotaFor(this.number);
    this.spawned = 0; this.resolved = 0;
    this.civDeaths = 0; this.civAbductions = 0; this.enemiesDestroyed = 0;
    this.complete = false; this.statsToShow = null;
    // the civilian pool grows every wave — 3 more join the world each time a new wave starts, per
    // Mike's request
    for(let i=0;i<CONFIG.humanoid.growthPerWave;i++) this.game.humanoids.push(new Humanoid(wrapX(Math.random()*WORLD_W)));
  }
}
