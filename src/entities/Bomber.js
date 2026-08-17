import { CONFIG, GROUND_Y, W } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';
import { Bomb } from './Bomb.js';

const BOMBER_SPEED = CONFIG.bomber.speed;
const BOMBER_ZIGZAG_AMP = CONFIG.bomber.zigzagAmp;
const BOMBER_ZIGZAG_FREQ = CONFIG.bomber.zigzagFreq;

// A separate enemy from roamers, whose entire job is dropping bombs. Per Mike's request, roamers no
// longer bomb anything — this is solely the bombers' responsibility. They cruise roughly
// horizontally at a fixed altitude band, weaving in a sine-wave zig-zag as they go specifically to
// make themselves a harder target to shoot (rather than lining up and hovering the way roamers used
// to). Bombers are wave-independent: they keep coming regardless of wave state, and never count
// toward a wave's clear quota.
export class Bomber {
  static spawn(game){
    const dir = Math.random()<0.5 ? -1 : 1;
    const baseY = CONFIG.bomber.baseYMin + Math.random()*CONFIG.bomber.baseYRandRange;
    // spawn off-screen on the side opposite of travel, so it flies INTO view rather than away from it
    const x = wrapX(game.camera.x - dir*(CONFIG.bomber.spawnDistMin+Math.random()*CONFIG.bomber.spawnDistRandRange));
    const bo = new Bomber(x, baseY, dir);
    game.bombers.push(bo);
    return bo;
  }

  constructor(x, baseY, dir){
    this.x = x;
    this.baseY = baseY;
    this.y = baseY;
    this.dir = dir;
    this.phase = Math.random()*Math.PI*2;
    this.alive = true;
    this.bombTimer = CONFIG.bomber.bombTimerMin + Math.random()*CONFIG.bomber.bombTimerRandRange;
  }

  // the respawn timer lives on the game (game.bomberRespawn) rather than as module state, so a
  // restart resets it along with everything else
  static updateAll(bombers, dt, game){
    game.bomberRespawn -= dt;
    if(game.bomberRespawn <= 0 && bombers.filter(bo=>bo.alive).length < CONFIG.bomber.maxAlive){
      Bomber.spawn(game);
      game.bomberRespawn = CONFIG.bomber.respawnTimerBase + Math.random()*CONFIG.bomber.respawnTimerRandRange;
    }
    for(const bo of bombers){
      if(!bo.alive) continue;
      bo.update(dt, game);
    }
    return bombers.filter(bo => bo.alive);
  }

  update(dt, game){
    this.phase += dt;
    this.x = wrapX(this.x + this.dir*BOMBER_SPEED*dt);
    this.y = this.baseY + Math.sin(this.phase*BOMBER_ZIGZAG_FREQ)*BOMBER_ZIGZAG_AMP;
    this.bombTimer -= dt;
    if(this.bombTimer <= 0) this._dropBomb(game);
    // despawn once it's flown well off both sides of the visible world so the list doesn't grow forever
    if(Math.abs(wrapDelta(game.camera.x, this.x)) > CONFIG.bomber.despawnDist) this.alive = false;
  }

  // drop straight down from wherever it happens to be right now — onto a building if it's flying
  // directly over one, otherwise open ground (or the on-foot player, if they're right below)
  _dropBomb(game){
    let targetBuilding = null, targetY = GROUND_Y;
    for(const b of game.buildings){
      if(!b.destroyed && b.containsX(this.x)){ targetBuilding = b; targetY = b.roofY; break; }
    }
    game.bombs.push(new Bomb(this.x, this.y, targetY, targetBuilding));
    game.sound.play('bombDrop', { x: this.x });
    this.bombTimer = CONFIG.bomber.reloadTimerBase + Math.random()*CONFIG.bomber.reloadTimerRandRange;
  }

  static drawAll(bombers, ctx, camera){
    for(const bo of bombers){
      if(!bo.alive) continue;
      bo.draw(ctx, camera);
    }
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx<-24||sx>W+24) return;
    ctx.save();
    ctx.translate(sx, this.y);
    ctx.scale(this.dir, 1); // faces whichever direction it's actually flying
    ctx.fillStyle = '#ff8a4d';
    ctx.beginPath();
    ctx.moveTo(-14,0); ctx.lineTo(-4,-6); ctx.lineTo(14,0); ctx.lineTo(-4,6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a1c0f';
    ctx.fillRect(-6,-2,8,4);
    ctx.restore();
  }
}
