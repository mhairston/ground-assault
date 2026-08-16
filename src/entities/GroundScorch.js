import { CONFIG, W } from '../config.js';
import { relX } from '../core/geometry.js';

// Scorch marks left behind by bombs that land on open ground (a bomb that lands on a building gets a
// punched hole instead — see Building.damage). Permanent, like building holes, but capped so a very
// long session doesn't grow the array forever.
export class ScorchField {
  constructor(max = CONFIG.bomb.maxGroundScorches){
    this.max = max;
    this.items = [];
  }

  clear(){ this.items = []; }

  add(x, y){
    this.items.push({ x, y });
    if(this.items.length > this.max) this.items.shift();
  }

  draw(ctx, camera){
    for(const s of this.items){
      const sx = relX(camera.x, s.x);
      if(sx<-20||sx>W+20) continue;
      ctx.fillStyle = 'rgba(20,14,10,0.55)';
      ctx.beginPath(); ctx.ellipse(sx, s.y+2, 16, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(10,7,5,0.4)';
      ctx.beginPath(); ctx.ellipse(sx, s.y+2, 9, 3, 0, 0, Math.PI*2); ctx.fill();
    }
  }
}
