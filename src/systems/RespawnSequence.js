import { CONFIG } from '../config.js';

// On death, the player's own input handling freezes so the explosion plays out undisturbed, then a
// "lives left" message holds for a couple seconds before the next life actually starts. Everything
// else in the world (roamers, bombs, bullets, debris, collisions) keeps running the whole time —
// see Game.update.
export class RespawnSequence {
  constructor(mode){
    this.stage = 'debris';   // 'debris' | 'showLives'
    this.timer = CONFIG.respawn.debrisStageDuration;
    this.mode = mode;        // 'flight' | 'foot' — which one died, and so which one comes back
  }

  // returns true once both stages have elapsed and the next life should start
  update(dt){
    this.timer -= dt;
    if(this.stage === 'debris' && this.timer <= 0){
      this.stage = 'showLives';
      this.timer = CONFIG.respawn.showLivesDuration;
      return false;
    }
    return this.stage === 'showLives' && this.timer <= 0;
  }
}
