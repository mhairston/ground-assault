import { W, GROUND_Y, WORLD_W } from '../config.js';
import { wrapX } from '../core/geometry.js';

// The minimap strip across the top of the screen.
export class Radar {
  constructor(){
    // rw is recomputed every draw from the current viewport width rather than fixed here — the
    // canvas resizes with the window now (see main.js), and a width captured at construction would
    // leave the strip its original size forever.
    this.rx = 20; this.ry = 14; this.rh = 18;
    this.rw = W - 2*this.rx;
    // vertical blip position, per Mike's request — proportionally maps a world y (from just above the
    // highest roamer/bomber spawn altitude down to ground level) into the strip's own vertical
    // extent, so a blip's height in the strip actually reflects how high up (or low down) that object
    // currently is. Buildings and the player's own position marker are deliberately left as
    // full-height landmark bars — they're not "objects" moving vertically in the sense the request
    // means; everything that actually moves up/down (humans, roamers, bombers, falling bombs) uses this.
    this.yMin = -100; this.yMax = GROUND_Y;
  }

  _mapX(wx){ return this.rx + (wrapX(wx)/WORLD_W)*this.rw; }
  _mapY(wy){
    const t = Math.max(0, Math.min(1, (wy - this.yMin) / (this.yMax - this.yMin)));
    return this.ry + 2 + t * (this.rh - 4);
  }

  draw(ctx, game){
    this.rw = W - 2*this.rx; // follow the window; _mapX reads this too
    const { rx, ry, rw, rh } = this;
    ctx.strokeStyle='#2a3a55'; ctx.strokeRect(rx,ry,rw,rh);
    ctx.fillStyle='rgba(20,30,50,0.7)'; ctx.fillRect(rx,ry,rw,rh);

    for(const b of game.buildings){
      ctx.fillStyle = b.destroyed ? '#5a4a3a' : '#4a6a8f';
      ctx.fillRect(this._mapX(b.x)-1,ry+2,2,rh-4);
    }

    // a human currently being chased by an alive roamer (i.e. that roamer's active target) blinks on
    // the radar, per Mike's request — "abducted" specifically means WHILE being hunted: once a
    // capture actually lands, the humanoid is marked dead and leaves play, so there's no
    // post-capture radar entry to blink at all, only this pre-capture pursuit window.
    const hunted = new Set();
    for(const r of game.roamers) if(r.alive && r.target) hunted.add(r.target);
    const blinkOn = Math.floor(performance.now()/250) % 2 === 0;
    for(const h of game.humanoids) if(h.alive){
      if(hunted.has(h) && !blinkOn) continue;
      ctx.fillStyle='#ffd76b'; ctx.fillRect(this._mapX(h.x)-1,this._mapY(h.topY)-1,2,2);
    }

    for(const r of game.roamers) if(r.alive){ ctx.fillStyle='#c98bff'; ctx.fillRect(this._mapX(r.x)-1,this._mapY(r.y)-1,2,2); }
    for(const bo of game.bombers) if(bo.alive){ ctx.fillStyle='#ff8a4d'; ctx.fillRect(this._mapX(bo.x)-1,this._mapY(bo.y)-1,2,2); }
    for(const bm of game.bombs){ ctx.fillStyle='#ff6a3d'; ctx.fillRect(this._mapX(bm.x)-1,this._mapY(bm.y)-2,2,4); }

    ctx.fillStyle='#8ff0ff';
    const px = game.mode==='flight' ? game.ship.x : game.pilot.x;
    ctx.fillRect(this._mapX(px)-2,ry+2,4,rh-4);
    // the viewport box: what fraction of the world is actually on screen, drawn to that same
    // fraction of the strip. Widen the window and it widens to match, per Mike's request.
    const vw=(W/WORLD_W)*rw;
    ctx.strokeStyle='rgba(143,240,255,0.6)'; ctx.strokeRect(this._mapX(game.camera.x)-vw/2, ry, vw, rh);
  }
}
