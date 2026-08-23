import { CONFIG, W, GROUND_Y } from '../config.js';
import { relX } from '../core/geometry.js';

// small fading fragments for destroyed roamers, explosions, building hits and deaths
class Fragment {
  // srcVx/srcVy are the velocity of whatever was destroyed — a fragment leaves carrying a share of
  // it on top of its own outward burst, so debris from a moving thing trails off along the path it
  // was travelling. Sources that were sitting still (or have no velocity to speak of, like a
  // building taking a hit) pass 0/0 and get the original burst-from-rest behavior exactly.
  // life overrides the usual lifeMin..lifeMin+lifeRandRange roll with a fixed duration instead — used
  // by an explosion that needs to visibly linger longer than a normal kill's debris (see
  // Game.explodeKamikazeWith), without changing how long every OTHER burst in the game lasts
  constructor(x, y, color, srcVx, srcVy, life = null){
    const ang = Math.random()*Math.PI*2, spd = 40+Math.random()*100;
    const spread = CONFIG.debris.momentumSpread;
    const share = CONFIG.debris.momentumInherit * (1 + (Math.random()*2-1)*spread);
    this.x = x; this.y = y;
    this.vx = Math.cos(ang)*spd + srcVx*share;
    this.vy = Math.sin(ang)*spd - 50 + srcVy*share;
    // maxLife is deliberately NOT always "this frame's own life": in the normal (no override) case
    // it's the fixed top of the whole lifeMin..lifeMin+lifeRandRange roll, so a fragment that happens
    // to roll a short life also starts out already partway faded — that's the existing look for every
    // ordinary burst in the game, and an explicit override must not disturb it. An overridden life
    // instead gets its own matching maxLife, so it starts fully opaque and fades over its full span.
    if(life != null){ this.life = life; this.maxLife = life; }
    else { this.life = CONFIG.debris.lifeMin + Math.random()*CONFIG.debris.lifeRandRange; this.maxLife = CONFIG.debris.lifeMin + CONFIG.debris.lifeRandRange; }
    this.color = color;
  }
}

export class DebrisField {
  constructor(){ this.items = []; }

  clear(){ this.items = []; }

  // returns how long the longest-lived of these fragments will burn for — i.e. when this particular
  // explosion is over. One number handed back at spawn time, so a caller can time something to the
  // end of it without holding a reference to the fragments or polling the field (see
  // Camera.followWreckage).
  spawn(x, y, color, count, srcVx = 0, srcVy = 0, life = null){
    let longest = 0;
    for(let i=0;i<count;i++){
      const frag = new Fragment(x, y, color, srcVx, srcVy, life);
      this.items.push(frag);
      longest = Math.max(longest, frag.life);
    }
    return longest;
  }

  update(dt){
    // pow(drag, dt) rather than a flat per-frame multiply, so a fragment decays the same amount per
    // second of game time no matter the frame rate or the sim-speed multiplier
    const keep = Math.pow(CONFIG.debris.drag, dt);
    for(const d of this.items){
      d.x += d.vx*dt; d.y += d.vy*dt;
      d.vy += CONFIG.debris.gravity*dt;
      d.vx *= keep; d.vy *= keep;
      // stops at ground level rather than falling through it, per Mike's request — settles there
      // (no more vertical motion) and just fades out over whatever life it has left
      if(d.y > GROUND_Y){ d.y = GROUND_Y; d.vy = 0; }
      d.life -= dt;
    }
    this.items = this.items.filter(d => d.life > 0);
  }

  draw(ctx, camera){
    for(const d of this.items){
      const sx = relX(camera.x, d.x);
      if(sx<-20||sx>W+20) continue;
      ctx.globalAlpha = Math.max(0, d.life/d.maxLife);
      ctx.fillStyle = d.color;
      ctx.fillRect(sx-2, d.y-2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}
