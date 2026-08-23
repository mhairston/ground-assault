import { CONFIG, GROUND_Y, W } from '../config.js';
import { relX, wrapDelta } from '../core/geometry.js';
import { Humanoid } from './Humanoid.js';

// falls from rest and accelerates under gravity, per Mike's request (previously a flat rate)
const CAPTIVE_FALL_GRAVITY = CONFIG.captive.fallGravity;
// a fall of 2 building "stories" or less is survivable — the captive gets up and rejoins as a normal
// (free) humanoid right where they landed instead of dying. ~25px/story, so ~50px total.
const STORY_HEIGHT = CONFIG.captive.surviveStoryHeight;
const SURVIVABLE_FALL_DIST = STORY_HEIGHT * CONFIG.captive.surviveStories;

// If a roamer carrying an abducted human is shot down (or superbombed), the human doesn't just
// vanish with it — they fall toward the ground. Flying the ship underneath one before it lands
// "catches" it: it then rides along beneath the ship until the ship comes in low enough to drop it
// off safely, becoming a normal humanoid again. Only one rides at a time.
export class FallingCaptive {
  constructor(x, y){
    this.x = x;
    this.y = y;
    this.startY = y;
    this.vy = 0; // falls from rest, gathering speed under gravity — see update()
    this.followShip = false;
    this.rescued = false;
    this.survived = false;
    this.lost = false;
  }

  // the shared "only one rides at a time" flag is why this is a list-level pass rather than a plain
  // per-captive update: catching one has to be visible to every other captive in the same tick
  static updateAll(captives, dt, game){
    let carrying = captives.some(c => c.followShip);
    for(const c of captives){
      carrying = c.update(dt, game, carrying);
    }
    return captives.filter(c => !c.rescued && !c.lost && !c.survived);
  }

  update(dt, game, carrying){
    if(this.followShip) return this._ride(game, carrying);

    this.y += this.vy*dt;
    this.vy += CAPTIVE_FALL_GRAVITY*dt;
    const ship = game.ship;
    if(!carrying && game.mode==='flight' && ship.alive && Math.abs(wrapDelta(ship.x,this.x)) < CONFIG.captive.catchTolX && Math.abs(ship.y-this.y) < CONFIG.captive.catchTolY){
      this.followShip = true; carrying = true;
    }
    if(this.y >= GROUND_Y - 4) this._land(game);
    return carrying;
  }

  _ride(game, carrying){
    const ship = game.ship;
    this.x = ship.x; this.y = ship.y + 14;
    // The ship "drops off" a carried captive once its altitude is close to whatever landable surface
    // is directly below/at it right now — landingSurfaceAt already finds the ground OR a rooftop
    // (whichever is closest to the ship's CURRENT y, at that x), same as the ship's own landing check
    // uses, so this works over ANY rooftop rather than only ones whose height happened to coincide
    // with the ship's minimum flight altitude. Deliberately no speed check (unlike actual landing),
    // per Mike's request that a drop-off work at any speed.
    if(game.mode==='flight' && ship.alive){
      const surf = game.landingSurfaceAt(ship.x, ship.y);
      if(surf.dist >= CONFIG.captive.dropDist) return carrying;
      const onRoof = !!surf.roofRef;
      const h = new Humanoid(this.x);
      if(onRoof){ h.roofRef = surf.roofRef; h.roofSettleTimer = CONFIG.captive.roofSettleMin + Math.random()*CONFIG.captive.roofSettleRandRange; }
      // three quick blinks instead of a debris burst when a captive is safely returned, per Mike's
      // request — this isn't an explosion, just a "they're back" flash (see Humanoid.draw)
      h.blinkTimer = CONFIG.captive.blinkDuration;
      game.humanoids.push(h);
      game.addScore(CONFIG.captive.scoreOnRescue);
      game.sound.play('civilianRescued');
      game.waves.recordCivRescue();
      this.rescued = true;
      return false;
    }
    return carrying;
  }

  _land(game){
    const fallDist = (GROUND_Y - 4) - this.startY;
    if(fallDist <= SURVIVABLE_FALL_DIST){
      // short fall — they're shaken but fine, and simply rejoin as a free humanoid. No score
      // penalty here: they were already scored as an abduction the moment they were grabbed, and
      // this isn't a death, so nothing further is deducted (see Game.loseHumanoid).
      const revived = new Humanoid(this.x);
      revived.blinkTimer = CONFIG.captive.blinkDuration; // blink instead of debris, per Mike's request — see above
      game.humanoids.push(revived);
      this.survived = true;
    } else {
      this.lost = true;
      game.spawnDebris(this.x, GROUND_Y-4, '#ffd76b', CONFIG.captive.debrisOnLost);
    }
  }

  static drawAll(captives, ctx, camera){
    for(const c of captives) c.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx<-20||sx>W+20) return;
    ctx.fillStyle = '#ffd76b';
    ctx.fillRect(sx-2, this.y-7, 4, 14);
    ctx.beginPath(); ctx.arc(sx, this.y-9, 3, 0, Math.PI*2); ctx.fill();
    if(this.followShip){
      // small tether line up to the ship so it's clear they're being carried, not just floating
      ctx.strokeStyle = 'rgba(255,215,107,0.5)';
      ctx.beginPath(); ctx.moveTo(sx, this.y-10); ctx.lineTo(sx, this.y-16); ctx.stroke();
    }
  }
}
