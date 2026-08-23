import { CONFIG, W, WORLD_W } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';

// A new, wave-independent persistent threat, per Mike's request — same footing as Bomber (no
// per-wave quota, just a steady trickle). Idles/patrols until whatever the player currently is —
// the ship in flight, or the pilot on foot — comes within triggerRange, then commits fully to
// closing the distance and ramming it. Its closing speed climbs slowly wave over wave (see
// _chaseSpeed), so the same trigger range gets more dangerous to ignore the deeper into a run you are.
export class Kamikaze {
  // spawn off the top of the screen, anywhere along the world's horizontal axis — same treatment
  // Roamer spawning got, so it isn't only ever seen wherever the camera happens to be
  static spawn(game){
    const k = new Kamikaze(
      wrapX(Math.random()*WORLD_W),
      CONFIG.kamikaze.spawnYBase - Math.random()*CONFIG.kamikaze.spawnYRandRange
    );
    game.kamikazes.push(k);
    return k;
  }

  constructor(x, y){
    this.x = x;
    this.y = y;
    this.w = CONFIG.kamikaze.w;
    this.h = CONFIG.kamikaze.h;
    this.vx = 0; this.vy = 0;
    this.alive = true;
    this.attacking = false;
    this.phase = Math.random()*10;
    this.wanderDir = Math.random()<0.5 ? -1 : 1;
    this.drawAngle = Math.random()*Math.PI*2;
  }

  // the respawn timer lives on the game (game.kamikazeRespawn), same as game.bomberRespawn, so a
  // restart resets it along with everything else
  static updateAll(kamikazes, dt, game){
    game.kamikazeRespawn -= dt;
    // don't start appearing until minWave, per Mike's request — the timer still counts down underneath
    // regardless, so one can appear right away once that wave actually starts rather than needing a
    // full fresh cycle first
    if(game.waves.number >= CONFIG.kamikaze.minWave && game.kamikazeRespawn <= 0 && kamikazes.filter(k=>k.alive).length < CONFIG.kamikaze.maxAlive){
      Kamikaze.spawn(game);
      game.kamikazeRespawn = CONFIG.kamikaze.respawnTimerBase + Math.random()*CONFIG.kamikaze.respawnTimerRandRange;
    }
    for(const k of kamikazes){
      if(!k.alive) continue;
      k.update(dt, game);
    }
    return kamikazes.filter(k=>k.alive);
  }

  // this run's closing speed once it commits to an attack — climbs slowly wave over wave, per Mike's
  // request, capped so later waves are more dangerous to approach without ever becoming an
  // impossible-to-outrun wall
  _chaseSpeed(game){
    const c = CONFIG.kamikaze;
    return Math.min(c.maxChaseSpeed, c.baseChaseSpeed + (game.waves.number-1)*c.chaseSpeedPerWave);
  }

  update(dt, game){
    this.phase += dt;
    const prevX = this.x, prevY = this.y;

    // chases the ship while flying, or the pilot on foot — same trigger range and closing speed
    // either way, per Mike's request that a kamikaze still pursue (and kill) an on-foot player rather
    // than only ever threatening the ship. Nothing to chase while the player is hidden/respawning or
    // inside a building (see the pilot.hidden check and the 'interior' fallthrough to null below) —
    // same pattern Roamer._maybeShoot already uses for "whichever the player currently is". Also
    // nothing to chase while the WAVE COMPLETE banner is up, per Mike's request — the player is
    // invulnerable during that window anyway (see WaveManager.triggerComplete), so a kamikaze
    // visibly charging at them the whole time would just read as broken rather than harmless.
    const target = game.waves.complete ? null
      : game.mode==='flight' ? (game.ship.alive ? game.ship : null)
      : game.mode==='foot' ? (!game.pilot.hidden ? game.pilot : null)
      : null;
    const targetY = target === game.pilot ? target.midY : (target ? target.y : 0);

    // true radial distance to the target, per Mike's request ("within 300px")
    const dx = target ? wrapDelta(this.x, target.x) : 0;
    const dy = target ? targetY - this.y : 0;
    const targetInRange = !!target && Math.hypot(dx,dy) < CONFIG.kamikaze.triggerRange;

    if(targetInRange){
      this.attacking = true;
      const speed = this._chaseSpeed(game);
      const dist = Math.hypot(dx,dy) || 1;
      this.x = wrapX(this.x + (dx/dist)*speed*dt);
      this.y += (dy/dist)*speed*dt;
    } else {
      this.attacking = false;
      // idle drift so it never just hangs motionless, same "never stay still" rule as Roamer
      if(Math.random() < dt*0.3) this.wanderDir *= -1;
      this.x = wrapX(this.x + this.wanderDir*CONFIG.kamikaze.wanderSpeed*dt);
      this.y += Math.sin(this.phase*0.7)*6*dt;
    }

    this.vx = wrapDelta(prevX, this.x)/dt;
    this.vy = (this.y - prevY)/dt;

    // drawn heading eases toward the actual direction of travel rather than snapping instantly, so
    // committing to an attack run reads as banking into a dive rather than an instant flip
    const targetAngle = Math.atan2(this.vy, this.vx);
    let da = targetAngle - this.drawAngle;
    da = Math.atan2(Math.sin(da), Math.cos(da)); // shortest signed angular distance, wrapped to [-pi,pi]
    this.drawAngle += da * Math.min(1, CONFIG.kamikaze.turnEaseRate*dt);
  }

  static drawAll(kamikazes, ctx, camera){
    for(const k of kamikazes) k.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx<-20||sx>W+20) return;
    ctx.save();
    ctx.translate(sx, this.y);
    ctx.rotate(this.drawAngle);
    const hw = this.w/2, apexX = this.w*0.55;
    if(this.attacking){
      // a trailing flame while committed to an attack run, so a chase reads as urgent, not just
      // "moving" — same flicker-on-a-sine-phase trick Ship._drawFlame uses
      const flicker = 0.7 + 0.3*Math.sin(this.phase*20);
      ctx.fillStyle = '#ff5e3d';
      ctx.beginPath();
      ctx.moveTo(-hw, this.h*0.3); ctx.lineTo(-hw-this.w*0.6*flicker, 0); ctx.lineTo(-hw, -this.h*0.3);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = this.attacking ? '#ff3b3b' : '#c94b3b';
    ctx.beginPath();
    ctx.moveTo(apexX,0); ctx.lineTo(-hw,this.h*0.45); ctx.lineTo(-hw*0.3,0); ctx.lineTo(-hw,-this.h*0.45);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
