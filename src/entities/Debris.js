import { CONFIG, W } from '../config.js';
import { relX } from '../core/geometry.js';

// small fading fragments for destroyed roamers, explosions, building hits and deaths
class Fragment {
  // srcVx/srcVy are the velocity of whatever was destroyed — a fragment leaves carrying a share of
  // it on top of its own outward burst, so debris from a moving thing trails off along the path it
  // was travelling. Sources that were sitting still (or have no velocity to speak of, like a
  // building taking a hit) pass 0/0 and get the original burst-from-rest behavior exactly.
  constructor(x, y, color, srcVx, srcVy){
    const ang = Math.random()*Math.PI*2, spd = 40+Math.random()*100;
    const spread = CONFIG.debris.momentumSpread;
    const share = CONFIG.debris.momentumInherit * (1 + (Math.random()*2-1)*spread);
    this.x = x; this.y = y;
    this.vx = Math.cos(ang)*spd + srcVx*share;
    this.vy = Math.sin(ang)*spd - 50 + srcVy*share;
    this.life = CONFIG.debris.lifeMin + Math.random()*CONFIG.debris.lifeRandRange;
    this.maxLife = CONFIG.debris.lifeMin + CONFIG.debris.lifeRandRange;
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
  spawn(x, y, color, count, srcVx = 0, srcVy = 0){
    let longest = 0;
    for(let i=0;i<count;i++){
      const frag = new Fragment(x, y, color, srcVx, srcVy);
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
