import { W } from '../config.js';
import { relX } from '../core/geometry.js';

// small fading fragments for destroyed roamers, explosions, building hits and deaths
class Fragment {
  constructor(x, y, color){
    const ang = Math.random()*Math.PI*2, spd = 40+Math.random()*100;
    this.x = x; this.y = y;
    this.vx = Math.cos(ang)*spd;
    this.vy = Math.sin(ang)*spd - 50;
    this.life = 0.5+Math.random()*0.4;
    this.maxLife = 0.9;
    this.color = color;
  }
}

export class DebrisField {
  constructor(){ this.items = []; }

  clear(){ this.items = []; }

  spawn(x, y, color, count){
    for(let i=0;i<count;i++) this.items.push(new Fragment(x, y, color));
  }

  update(dt){
    for(const d of this.items){ d.x += d.vx*dt; d.y += d.vy*dt; d.vy += 220*dt; d.life -= dt; }
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
