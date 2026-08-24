import { CONFIG, W, H } from '../config.js';
import { relX, wrapDelta } from '../core/geometry.js';

const BULLET_TRAIL_LEN = CONFIG.bullet.trailLength;

// Bullets move in straight lines with NO world-wrap, and are culled once cullMargin past the visible
// screen edge or once they've traveled their maximum range. Motion is per-tick (not dt-scaled) —
// that's why Game runs whole extra logic ticks for sim speed rather than just scaling dt, so bullets
// speed up along with everything else.
class BulletBase {
  constructor(x, y, vx, vy){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dist = 0;
    this.dead = false;
  }

  step(){
    this.x += this.vx; this.y += this.vy;
    // fizzle out at maximum range, per Mike's request — tracked as accumulated travel distance
    // (frame-based, matching the bullet's own frame-based x/y motion) rather than distance from the
    // player's current position, so it doesn't matter whether the shooter has since moved
    this.dist += Math.hypot(this.vx, this.vy);
  }

  isSpent(camX, maxRange){
    if(this.dist >= maxRange) return true;
    const sx = relX(camX, this.x);
    const m = CONFIG.bullet.cullMargin;
    return !(sx > -m && sx < W+m && this.y > -m && this.y < H+m);
  }
}

// Player fire. Keeps a long trail of recent positions for a persistent Defender-style streaking
// bolt — the shot stays visible as a fading comet-tail for a while rather than a brief blip.
export class PlayerBullet extends BulletBase {
  constructor(x, y, vx, vy, up){
    super(x, y, vx, vy);
    this.up = up;
    this.trail = [];
  }

  step(){
    this.trail.push({x: this.x, y: this.y});
    if(this.trail.length > BULLET_TRAIL_LEN) this.trail.shift();
    super.step();
  }

  // Any point along the visible trail — not just the bolt's current head position — can land a hit
  // against a bomb being shot down. Checked against the target's CURRENT position each frame, so
  // this is a generous elongated hit region trailing behind every shot rather than a true
  // trajectory-intersection test: a fast-moving target can still be caught by an older segment of a
  // trail that's already passed it.
  trailHit(x, y, xtol, ytol){
    if(this.headHit(x, y, xtol, ytol)) return true;
    for(const tp of this.trail){
      if(Math.abs(wrapDelta(tp.x,x)) < xtol && Math.abs(tp.y-y) < ytol) return true;
    }
    return false;
  }

  // Enemies (roamers/bombers) can only be destroyed by the bullet's actual current head position,
  // per Mike's request — NOT by any point along its trail. trailHit stays in effect for shooting
  // down bombs (not an "enemy" in the sense of the request), but killing a roamer or bomber needs
  // the real bolt to actually be there this frame.
  headHit(x, y, xtol, ytol){
    return Math.abs(wrapDelta(this.x,x)) < xtol && Math.abs(this.y-y) < ytol;
  }

  static updateAll(bullets, camera){
    for(const b of bullets) b.step();
    return bullets.filter(b => !b.isSpent(camera.x, CONFIG.bullet.maxRange));
  }

  static drawAll(bullets, ctx, camera){
    for(const b of bullets) b.draw(ctx, camera);
    ctx.globalAlpha = 1;
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx < -8 || sx > W+8) return;
    // long, slow-fading comet-tail behind the bolt — closer to the original Defender look than a
    // quick blip. A square-root falloff keeps the older/farther segments relatively more visible
    // instead of dropping off sharply right behind the head.
    for(let i=0;i<this.trail.length;i++){
      const tp = this.trail[i];
      const tsx = relX(camera.x, tp.x);
      const frac = (i+1)/this.trail.length;
      ctx.globalAlpha = Math.pow(frac, 0.55) * 0.6;
      ctx.fillStyle = '#8ff0ff';
      this._rect(ctx, tsx, tp.y);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#eaffff';
    this._rect(ctx, sx, this.y);
  }

  // twice as tall as the original in both orientations, per Mike's request — see the matching
  // collision-tolerance widening in CollisionSystem
  _rect(ctx, sx, y){
    if(this.up) ctx.fillRect(sx-1, y-CONFIG.bullet.heightVert/2, 2, CONFIG.bullet.heightVert);
    else ctx.fillRect(sx-CONFIG.bullet.widthHoriz/2, y-CONFIG.bullet.heightHoriz/2, CONFIG.bullet.widthHoriz, CONFIG.bullet.heightHoriz);
  }
}

// ---- roamer gunfire: straight left/right shots at whichever mode the player is in ----
export class EnemyBullet extends BulletBase {
  static updateAll(bullets, camera){
    for(const b of bullets) b.step();
    // roamer gunfire fizzles out at range too, per Mike's request — same accumulated-distance
    // approach as player bullets, just its own longer range
    return bullets.filter(b => !b.isSpent(camera.x, CONFIG.bullet.enemyMaxRange));
  }

  static drawAll(bullets, ctx, camera){
    ctx.globalAlpha = 1;
    for(const b of bullets){
      const sx = relX(camera.x, b.x);
      if(sx<-4||sx>W+4) continue;
      ctx.fillStyle = '#ff86a0';
      ctx.fillRect(sx-4, b.y-2, 8, 4);
      ctx.fillStyle = '#ffd6df';
      ctx.fillRect(sx-2, b.y-1, 4, 2);
    }
    ctx.globalAlpha = 1;
  }
}
