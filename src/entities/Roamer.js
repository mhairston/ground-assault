import { CONFIG, W } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';
import { EnemyBullet } from './Bullet.js';

// Roamers hunt humanoids — bombing raids are the bombers' job (see Bomber), not the roamers'.
export class Roamer {
  // spawn off the top of the screen (not already hovering mid-air) and descend into hunting
  // altitude. Biased near the current camera so the descent is actually visible reasonably often,
  // not buried deep in unseen world space.
  static spawn(game){
    const r = new Roamer(
      wrapX(game.camera.x + (Math.random()<0.5?-1:1) * (CONFIG.roamer.spawnDistMin+Math.random()*CONFIG.roamer.spawnDistRandRange)),
      CONFIG.roamer.spawnYBase - Math.random()*CONFIG.roamer.spawnYRandRange
    );
    game.roamers.push(r);
    return r;
  }

  constructor(x, y){
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.alive = true;
    this.descending = true;
    this.descendTargetY = CONFIG.roamer.descendTargetYBase+Math.random()*CONFIG.roamer.descendTargetYRandRange;
    this.target = null;
    this.carrying = false;
    this.departing = false;
    this.escapeDir = 1;
    this.phase = Math.random()*10;
    this.wanderDir = Math.random()<0.5?-1:1;
    this.shootTimer = CONFIG.roamer.initialShootTimerMin+Math.random()*CONFIG.roamer.initialShootTimerRandRange;
    // this roamer's own cruise/transit altitude, distinct from every other roamer's — see the
    // CONFIG.roamer.preferredAlt* comment
    this.preferredAltY = CONFIG.roamer.preferredAltMin + Math.random()*CONFIG.roamer.preferredAltRandRange;
    this.drawTilt = 0;
  }

  static updateAll(roamers, dt, game){
    game.waves.tickRelease(dt);
    for(const r of roamers){
      if(!r.alive) continue;
      r.update(dt, game);
    }
    Roamer.easeTilts(roamers, dt);
    Roamer.separate(roamers, dt);
    game.waves.countResolved(roamers);
    const alive = roamers.filter(r=>r.alive);
    game.waves.checkComplete(alive);
    return alive;
  }

  update(dt, game){
    this.phase += dt;
    // tracked so draw() can tilt the sprite back slightly opposite its actual direction of travel
    // this frame — computed once at the bottom (or at each early return) from how far x moved,
    // rather than duplicating per-branch velocity math
    const prevX = this.x;

    if(this.descending){
      this.y += CONFIG.roamer.descendSpeed*dt;
      // a little horizontal drift on the way in — otherwise a roamer entering off the top of the
      // screen holds a single x for a couple of seconds while it falls, which reads as "stuck in
      // place." Per Mike's request that roamers never stay still, ever.
      this.x = wrapX(this.x + Math.sin(this.phase*1.2)*CONFIG.roamer.descendDriftAmp*dt);
      if(this.y >= this.descendTargetY){ this.y = this.descendTargetY; this.descending = false; }
      this.vx = wrapDelta(prevX, this.x)/dt;
      return; // just falling in — no combat/hunting until it's settled
    }

    // after grabbing a captive, climb up and off the top of the screen carrying them, instead of
    // just popping out of existence at the building — climbs noticeably slower than a normal
    // (uncumbered) roamer, per Mike's request, since it's now hauling someone. Escapes up and to
    // one side (the direction picked once at capture time) rather than straight up, with a little
    // wobble layered on top for visual flair.
    if(this.departing){
      this.y -= CONFIG.roamer.departClimbSpeed*dt; // half the original 130 climb speed while carrying a captive
      const escapeDir = this.escapeDir || 1;
      this.x = wrapX(this.x + escapeDir*CONFIG.roamer.escapeSpeed*dt + Math.sin(this.phase*1.5)*4*dt); // 2x horizontal speed, per Mike's request
      this.vx = wrapDelta(prevX, this.x)/dt;
      if(this.y < -40) this.alive = false;
      return;
    }

    this._maybeShoot(dt, game);
    this._acquireTarget(game);
    if(this.target) this._hunt(dt, game);
    else this._patrol(dt);
    this.vx = wrapDelta(prevX, this.x)/dt;
  }

  // strafing gunfire: fire a straight left/right shot at whatever the player currently is. Stops
  // once the game is over, per Mike's request (bombers keep bombing regardless — see Bomber) — the
  // timer is simply left frozen rather than ticking down, so gunfire picks back up exactly where it
  // left off if the game is ever un-paused (it isn't, currently, but this keeps the timer state sane
  // rather than resetting it).
  _maybeShoot(dt, game){
    if(game.gameOver) return;
    this.shootTimer -= dt;
    if(this.shootTimer > 0) return;
    const targetPos = game.mode==='flight' ? game.ship : (game.mode==='foot' ? game.pilot : null);
    if(!targetPos){ this.shootTimer = CONFIG.roamer.idleRecheck; return; }
    const ddx = wrapDelta(this.x, targetPos.x);
    if(Math.abs(ddx) < CONFIG.roamer.gunfireRange){
      const dir = ddx >= 0 ? 1 : -1;
      game.enemyBullets.push(new EnemyBullet(this.x, this.y, dir*CONFIG.roamer.gunfireSpeed, 0));
      this.shootTimer = CONFIG.roamer.shootTimerMin + Math.random()*CONFIG.roamer.shootTimerRandRange;
    } else {
      this.shootTimer = CONFIG.roamer.outOfRangeRecheck; // out of range — check again soon
    }
  }

  _acquireTarget(game){
    if(!this.target){
      let best=null, bd=1e9;
      for(const h of game.humanoids) if(h.alive && !h.safe){ const d=Math.abs(wrapDelta(this.x,h.x)); if(d<bd){ bd=d; best=h; } }
      this.target = best;
    }
    if(this.target && (!this.target.alive || this.target.safe)) this.target = null;
  }

  _hunt(dt, game){
    // roamers dive all the way down to wherever the humanoid actually is right now before a capture
    // registers, per Mike's request — ground level, a rooftop, or mid-ladder-climb, via Humanoid's
    // topY, rather than always assuming ground level. This does put them in the same airspace the
    // ship uses at its lowest during a ground-level dive, so expect more ship-roamer collisions
    // during a capture dive than before; flagged in the design brief. Roamers can also grab a target
    // that's up on a rooftop or partway down a ladder, not just on the ground.
    const captureY = this.target.topY + CONFIG.roamer.captureOffset; // near the target's feet, however tall they are
    // A target can be anywhere in the world (the nearest-living-humanoid search has no distance
    // limit), so a roamer that just acquired one might be thousands of pixels away horizontally.
    // Diving to captureY immediately meant it would then cruise the ENTIRE horizontal approach at
    // near-ground altitude — exactly the "no cruising the ground" problem, just from the hunting path
    // this time rather than the old lurch bug. Only commit to the low altitude once basically
    // overhead; stay at a normal cruising altitude for the horizontal transit otherwise — this
    // roamer's own preferredAltY (assigned once at spawn) rather than one shared constant, per Mike's
    // request that roamers seek unique altitudes so multiple roamers transiting toward different
    // targets don't all line up on the same row and look like they're shooting each other.
    const TRANSIT_Y = this.preferredAltY;
    const NEAR_HORIZONTALLY = CONFIG.roamer.nearHorizontally;
    const dx = wrapDelta(this.x, this.target.x);
    // once basically right over the target, swap the direct closing speed for a small side-to-side
    // wobble instead of just riding dx down to (near) zero — otherwise a roamer hangs almost
    // perfectly still in x for the several seconds its dive takes to reach the target's altitude,
    // which reads as "stuck in place." Per Mike's request that roamers never stay still, ever.
    const closingSpeed = Math.abs(dx) < CONFIG.roamer.wobbleThreshold ? Math.sin(this.phase*4)*CONFIG.roamer.wobbleAmp : Math.sign(dx)*CONFIG.roamer.huntSpeed; // 2x horizontal speed, per Mike's request
    this.x = wrapX(this.x + closingSpeed*dt);
    const overheadOfTarget = Math.abs(dx) < NEAR_HORIZONTALLY;
    const diveTargetY = overheadOfTarget ? captureY : TRANSIT_Y;
    // A proportional (exponential-decay) approach never mathematically reaches zero — a tight
    // few-pixel tolerance needs a fast enough closing rate to actually get there in a reasonable
    // time, not the old lazy 0.6 rate that was tuned for a generous 20px tolerance. BUT a bare
    // proportional term is unbounded: right when a roamer first acquires a target (often while still
    // up at wander altitude, far above hover height) the gap is huge, so the raw term produced a big
    // one-frame vertical snap — read as roamers "suddenly lurching downward." Clamped to a max
    // vertical closing speed so it's a smooth dive in from any starting altitude, same as the
    // horizontal approach speed above.
    const MAX_DIVE_SPEED = CONFIG.roamer.maxDiveSpeed;
    const dy = diveTargetY - this.y;
    const climbSpeed = Math.sign(dy) * Math.min(Math.abs(dy)*CONFIG.roamer.diveGain, MAX_DIVE_SPEED);
    this.y += climbSpeed*dt + Math.sin(this.phase*2)*2*dt;
    if(overheadOfTarget && Math.abs(dx) < CONFIG.roamer.captureTolX && Math.abs(this.y-captureY) < CONFIG.roamer.captureTolY){
      this._capture(game);
    }
  }

  _capture(game){
    const captured = this.target;
    captured.alive = false;
    game.loseHumanoid(captured, 'abducted');
    this.carrying = true; // drawn dangling beneath it while it climbs out (see draw)
    this.departing = true;
    // fly off up and to one side rather than straight up — chosen once per capture so it's a
    // consistent diagonal escape, not an oscillation back to a net-zero drift
    this.escapeDir = Math.random() < 0.5 ? -1 : 1;
    this.target = null;
  }

  // no humanoids left to hunt — keep patrolling instead of hovering in place, gently easing back
  // toward this roamer's own preferred altitude (rather than drifting freely) so a pack of idle
  // roamers spreads across different heights instead of all settling near the same one — same
  // "unique altitudes" request as the hunting-transit change above.
  _patrol(dt){
    if(Math.random() < dt*0.3) this.wanderDir *= -1;
    this.x = wrapX(this.x + this.wanderDir*CONFIG.roamer.wanderSpeed*dt); // 2x horizontal speed, per Mike's request
    this.y += (this.preferredAltY - this.y)*CONFIG.roamer.altHomePull*dt + Math.sin(this.phase*0.7)*6*dt;
  }

  // Ease each roamer's drawn tilt toward this frame's target tilt rather than snapping instantly, per
  // Mike's request that the (now-larger, 10-degree) tilt transition be animated. A separate pass
  // after the main update loop (rather than inline) because vx is set at several different early
  // returns inside update() (descending, departing) as well as at its very end — by the time the loop
  // has fully finished, every alive roamer's vx reflects this frame's actual movement regardless of
  // which branch it took, so tilt easing applies uniformly to descending/departing/hunting/wandering
  // roamers alike instead of only the ones that reached the bottom of update().
  static easeTilts(roamers, dt){
    const maxTiltRad = CONFIG.roamer.tiltMaxDeg * Math.PI/180;
    for(const r of roamers){
      if(!r.alive) continue;
      const targetTilt = Math.max(-maxTiltRad, Math.min(maxTiltRad, -(r.vx||0) * CONFIG.roamer.tiltScale));
      r.drawTilt = (r.drawTilt||0) + (targetTilt - (r.drawTilt||0)) * Math.min(1, CONFIG.roamer.tiltEaseRate*dt);
    }
  }

  // if two roamers end up on top of each other (most often two idle wanderers settling at the same
  // spot), gently push them apart sideways so both stay individually visible instead of overlapping
  static separate(roamers, dt){
    const SEP_DIST = CONFIG.roamer.separationDist, SEP_Y = CONFIG.roamer.separationY;
    for(let i=0;i<roamers.length;i++){
      const a = roamers[i];
      if(!a.alive || a.descending || a.departing) continue;
      for(let j=i+1;j<roamers.length;j++){
        const b = roamers[j];
        if(!b.alive || b.descending || b.departing) continue;
        const dx = wrapDelta(a.x,b.x);
        if(Math.abs(dx) >= SEP_DIST || Math.abs(a.y-b.y) >= SEP_Y) continue;
        const dir = dx >= 0 ? 1 : -1; // b sits on the +dir side of a
        const push = (SEP_DIST - Math.abs(dx) + 1) * CONFIG.roamer.separationPush * dt;
        b.x = wrapX(b.x + dir*push);
        a.x = wrapX(a.x - dir*push);
      }
    }
  }

  static drawAll(roamers, ctx, camera){
    for(const r of roamers) r.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx<-20||sx>W+20) return;
    if(this.carrying){
      // captive dangling beneath, visibly carried off as the roamer climbs out of view
      ctx.fillStyle = '#ffd76b';
      ctx.fillRect(sx-2, this.y+7, 4, 9);
      ctx.beginPath(); ctx.arc(sx, this.y+5, 3, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,107,0.5)';
      ctx.beginPath(); ctx.moveTo(sx, this.y+2); ctx.lineTo(sx, this.y-6); ctx.stroke();
    }
    // tilts back slightly opposite its direction of travel — a small sense of momentum/lean rather
    // than gliding around perfectly upright, capped at tiltMaxDeg. drawTilt is computed and eased
    // toward its target once per frame in easeTilts, so drawing just reads it directly.
    ctx.save();
    ctx.translate(sx, this.y);
    ctx.rotate(this.drawTilt || 0);
    ctx.fillStyle = '#c98bff';
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(10,6); ctx.lineTo(-10,6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
