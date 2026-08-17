import { CONFIG, W, MIN_FLIGHT_ALT_Y } from '../config.js';
import { relX, wrapX } from '../core/geometry.js';
import { PlayerBullet } from './Bullet.js';

// vertical speed used for the automatic landing/takeoff sequences (not a player-controlled thrust
// value — a flat rate the ship glides at while the pilot is hands-off during the transition)
const AUTO_VSPEED = CONFIG.ship.autoGlideSpeed;
const SHIP_BURST_SIZE = CONFIG.ship.burstSize;
const SHIP_BURST_INTERVAL = CONFIG.ship.burstInterval;
const SHIP_COOLDOWN_TIME = CONFIG.ship.burstCooldown; // burst size doubled (3->6) so each burst lasts 2x as long at the same rate of fire, per Mike's request

export class Ship {
  constructor(pad){
    this.pad = pad;
    this.w = CONFIG.ship.w;
    this.h = CONFIG.ship.h;
    this.reset();
  }

  reset(){
    this.x = this.pad.x;
    this.y = this.pad.y + CONFIG.ship.startYOffset;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.alive = true;
    this.invuln = 0;
    this.airborne = false;
    this.parkedOn = null;
    this.auto = null;            // null | 'takeoff' | 'landing'
    this.autoTargetY = null;
    this.autoLandSurf = null;
    this.shootCooldown = 0;
    this.burstCount = 0;
    this.coolingDown = 0;
  }

  get speed(){ return Math.hypot(this.vx, this.vy); }

  // the ship now respawns airborne in the middle of the screen, per Mike's request, rather than back
  // at the ground pad. H/2 is well clear of any landable surface's resting height, so with landing
  // gated on an explicit A press there's no re-arm bookkeeping needed here either — the respawned
  // ship simply isn't anywhere near a landing trigger until the player flies it there.
  respawnAirborne(x, y){
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.invuln = CONFIG.ship.invulnAfterRespawn;
    this.alive = true; this.airborne = true; this.parkedOn = null;
    this.auto = null; this.autoTargetY = null;
  }

  // the pilot gets in immediately, then the ship automatically lifts CONFIG.ship.boardLiftHeight
  // pixels above wherever it boarded (never below MIN_FLIGHT_ALT_Y, and clamped to flightCeilingY) —
  // a real, visible liftoff, purely a "you're airborne now" visual cue. Player thrust/shoot controls
  // are locked out until the liftoff glide finishes (see update()'s auto === 'takeoff').
  board(x){
    this.x = x; this.vx = 0; this.vy = 0; this.airborne = true; // this.y already holds the correct parked-surface rest height
    this.auto = 'takeoff';
    this.autoTargetY = Math.max(CONFIG.ship.flightCeilingY, Math.min(this.y, MIN_FLIGHT_ALT_Y) - CONFIG.ship.boardLiftHeight);
  }

  beginLanding(surface){
    this.auto = 'landing';
    this.autoTargetY = surface.topY - 8;
    this.autoLandSurf = surface;
    this.vx = 0; this.vy = 0;
  }

  shoot(game){
    if(game.mode!=='flight' || !this.alive) return;
    // 30% faster than the original 18 — every ship shot is fired within a burst now, so this applies
    // to all of them, per Mike's request
    game.playerBullets.push(new PlayerBullet(this.x + this.facing*CONFIG.ship.bulletOffsetX, this.y, this.facing*CONFIG.ship.bulletSpeed, 0, false));
    game.sound.play('laser');
  }

  update(dt, game){
    if(!this.alive) return;

    // ---- takeoff/landing glides: both triggered by pressing A (see Game.tryBoardOrLand), not
    // automatically — but once triggered, each plays out as a hands-off vertical glide (player
    // thrust/shoot/superbomb controls locked out for the duration) that completes on its own. ----
    if(this.auto === 'takeoff'){ this._glideTo(dt, game, () => { this.y = this.autoTargetY; this.auto = null; }); return; }
    if(this.auto === 'landing'){ this._glideTo(dt, game, () => this._touchDown(game)); return; }

    this._thrust(dt, game);
    this._clampAltitude(game);
    game.camera.follow(this.x);
    this._fire(dt, game);

    // superbomb usable from the ship too, not just on foot — same shared stash/effect
    if(game.input.isDown('KeyS') && game.pilot.superbombCount>0) game.useSuperbomb();

    // landing itself is triggered by pressing A — see Game.tryBoardOrLand().
    if(this.invuln>0) this.invuln -= dt;
  }

  _glideTo(dt, game, onArrive){
    const dy = this.autoTargetY - this.y;
    this.y += Math.sign(dy)*Math.min(Math.abs(dy), AUTO_VSPEED*dt);
    game.camera.follow(this.x);
    if(Math.abs(this.autoTargetY - this.y) < 1) onArrive();
    if(this.invuln>0) this.invuln -= dt;
  }

  _touchDown(game){
    const surf = this.autoLandSurf;
    game.mode = 'foot';
    game.pilot.landAt(this.x, surf);
    this.airborne = false; this.vx = 0; this.vy = 0; this.auto = null; this.parkedOn = surf.roofRef;
    game.sound.play('disembark');
    game.camera.follow(game.pilot.x);
  }

  // ship speed history: doubled from the original prototype, bumped for snappier handling, +50% top
  // speed, and now slightly slower acceleration but a much higher top speed (170% of the prior
  // practical top speed). Watch the acc/drag-equilibrium gotcha: the ship's real cruising speed is
  // v_ss = acc*dt*drag/(1-drag) at 60fps, NOT the maxV clamp (maxV is pure headroom).
  // Old: acc=900, drag=0.985 -> v_ss ≈ 985px/s. New: acc trimmed to 800 (~11% weaker initial punch —
  // the "slightly slower acceleration" part) while drag is raised much closer to 1 (0.985->0.9921),
  // which is what actually drives the new equilibrium up to ≈1674px/s (985 * 1.70 — the "170% of
  // current max speed" part). Raising drag alone would do that regardless of acc; the acc trim is
  // there specifically so the ramp-up still feels a touch less punchy off the line, not just faster
  // at the top end. maxV keeps the same ~13% headroom-above-equilibrium ratio as before (1110/985).
  // All of the above applies to the horizontal axis only. Up/Down is NOT a thrust, per Mike's
  // request: holding a key means travelling at a flat CONFIG.ship.verticalSpeed, and releasing it
  // means stopping — the config number IS the speed, with no acceleration curve or drag equilibrium
  // in between. What it does have is a short ease on and off that speed (verticalEaseRate), because
  // switching vy between 0 and full rate in a single frame is a visible snap at both ends. The ease
  // is deliberately quick: it takes the edge off the start, stop and reversal without banking any
  // real momentum, so pressing the opposite key still turns the ship around promptly rather than
  // making the player wait out a glide. Holding both at once cancels to a hover.
  _thrust(dt, game){
    const input = game.input;
    const acc = CONFIG.ship.acceleration, drag = CONFIG.ship.drag, maxV = CONFIG.ship.maxSpeed;
    // the thruster fires on horizontal thrust only — that's the axis with an engine behind it, since
    // Up/Down is a flat rate rather than something the ship burns fuel to do (see below)
    this.thrusting = input.isDown('ArrowLeft') || input.isDown('ArrowRight');
    if(this.thrusting) this.flamePhase += dt*CONFIG.ship.flameAnimSpeed;
    if(input.isDown('ArrowLeft')){ this.vx -= acc*dt; this.facing=-1; }
    if(input.isDown('ArrowRight')){ this.vx += acc*dt; this.facing=1; }
    this.vx *= drag;
    this.vx = Math.max(-maxV, Math.min(maxV, this.vx));

    const down = input.isDown('ArrowDown') ? 1 : 0, up = input.isDown('ArrowUp') ? 1 : 0;
    const targetVy = (down - up) * CONFIG.ship.verticalSpeed;
    // Driving and coasting get their own rates, per Mike's request for more vertical momentum. While
    // a key is held the ship answers it briskly (verticalEaseRate) — including a reversal, which
    // targets full speed the other way and so is still driven, not coasted. Let go and it falls back
    // to the much lazier verticalCoastRate, carrying on for a moment and bleeding off rather than
    // pulling up short. exp(-rate*dt) rather than a flat per-frame fraction, so either takes the same
    // amount of real time at any frame rate or sim-speed multiplier.
    const rate = targetVy === 0 ? CONFIG.ship.verticalCoastRate : CONFIG.ship.verticalEaseRate;
    this.vy += (targetVy - this.vy) * (1 - Math.exp(-rate*dt));
    // an exponential approach never quite arrives; settle the last pixel-per-second outright so a
    // released key really does mean stopped, rather than a permanent imperceptible creep
    if(targetVy === 0 && Math.abs(this.vy) < 1) this.vy = 0;

    this.x = wrapX(this.x + this.vx*dt);
    this.y += this.vy*dt;
  }

  // keep the ship below the radar strip (drawn at y 14-32) — flying up into it used to make the
  // ship visually get "stuck" behind/inside the minimap overlay. Upper bound (flightCeilingY) is
  // fixed. Lower bound normally matches the same minimum-altitude-above-ground the roamers respect
  // (MIN_FLIGHT_ALT_Y = GROUND_Y-45) — no zooming along at ground level under normal thrust — BUT
  // that floor has to be able to extend down to a landable surface's true resting height (open
  // ground, or a rooftop with a landing pad), or the player could never get close enough to press A
  // and land (landDist is only 20px, well inside the ~37px gap between the normal floor and the
  // ground). Game.landingSurfaceAt() finds the nearest candidate surface below/around the ship;
  // "landable" mirrors the same rule Game.tryBoardOrLand's landing check uses. A landable surface's
  // own restY becomes the floor directly — not just the DEEPER of restY and the normal
  // MIN_FLIGHT_ALT_Y. That distinction matters for tall landing-pad buildings: their roof sits ABOVE
  // the normal cruise floor (a smaller y than MIN_FLIGHT_ALT_Y), so taking the max of the two would
  // let the ship sail straight through the pad and keep descending toward the normal floor —
  // visually clipping through what's supposed to be a solid landing surface. Using restY directly
  // hard-stops the ship right at the pad the instant it's landable there. Flying over a pad-less
  // rooftop is unaffected — it still stops at the normal MIN_FLIGHT_ALT_Y floor as before, out of
  // landing-distance range entirely.
  _clampAltitude(game){
    const landSurf = game.landingSurfaceAt(this.x, this.y);
    const landable = !landSurf.roofRef || landSurf.roofRef.hasLandingPad;
    const floorY = landable ? (landSurf.topY - 8) : MIN_FLIGHT_ALT_Y;
    const clampedY = Math.max(CONFIG.ship.flightCeilingY, Math.min(floorY, this.y));
    // Only the vertical velocity dies against a vertical bound, and only that. Zeroing vy is what
    // makes the bounds feel solid AND keeps them responsive: without it, holding Up at the ceiling
    // banks up nearly 1700px/s of upward momentum that has to be burned off before the ship budges
    // downward, so the reversal lags by seconds — with it, vy restarts from 0 and Down bites on the
    // very next frame (same story for Up at the floor). vx is deliberately left alone: it isn't the
    // component that hit anything, and zeroing it both froze horizontal control while a vertical key
    // was held against a bound and short-circuited the landing speed gate (Game.tryBoardOrLand reads
    // this.speed, which with vx and vy both forced to 0 always passed, letting the ship set down at
    // full throttle).
    if(clampedY !== this.y) this.vy = 0;
    this.y = clampedY;
  }

  // burst-fire: BURST_SIZE shots at the normal rate, then a forced cooldown pause before the next
  // burst can start, regardless of whether SPACE is still held down
  _fire(dt, game){
    if(this.coolingDown > 0){
      this.coolingDown -= dt;
      if(this.coolingDown <= 0) this.burstCount = 0;
      return;
    }
    if(this.shootCooldown>0) this.shootCooldown -= dt;
    if(game.input.isDown('Space') && this.shootCooldown<=0){
      this.shoot(game);
      this.shootCooldown = SHIP_BURST_INTERVAL;
      this.burstCount++;
      if(this.burstCount >= SHIP_BURST_SIZE){
        this.coolingDown = SHIP_COOLDOWN_TIME;
        game.sound.play('burstCooldown');
      }
    }
  }

  draw(ctx, camera){
    if(!this.alive) return;
    const sx = relX(camera.x, this.x), sy = this.y;
    if(sx<-30||sx>W+30) return;
    ctx.save(); ctx.translate(sx,sy); ctx.scale(this.facing,1);
    if(this.invuln>0 && Math.floor(this.invuln*20)%2===0) ctx.globalAlpha=0.3;
    ctx.fillStyle = '#8ff0ff';
    // hull silhouette expressed as fractions of w/h (rather than the old fixed pixel literals:
    // -13,4 / 13,0 / -13,-4 / -6,0, tuned for the original 26x12 ship) so the drawing scales
    // automatically with CONFIG.ship.w/h — the 2x-size ship (per Mike's request) is purely a CONFIG
    // edit rather than a separate drawing change.
    const hw = this.w/2, notchX = -this.w*(6/26), topY = this.h/3, botY = -this.h/3;
    ctx.beginPath(); ctx.moveTo(-hw,topY); ctx.lineTo(hw,0); ctx.lineTo(-hw,botY); ctx.lineTo(notchX,0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Exhaust plume out of the tail while the engine is firing, per Mike's request. Called from inside
  // draw()'s translate/scale(facing) frame, so it needs no direction handling of its own — mirroring
  // the hull mirrors the flame with it, and it always trails the right way. Two tapered tongues, an
  // outer orange and an inner yellow core, both flickering on the same phase so the plume pulses as
  // one. Geometry is fractions of w/h for the same reason the hull's is (see above): the ship's size
  // is a CONFIG edit, and the flame should scale with it rather than needing its own numbers.
  _drawFlame(ctx){
    if(!this.thrusting) return;
    const flicker = 0.7 + 0.3*Math.sin(this.flamePhase);
    const rear = -this.w/2, len = this.w*0.4*flicker;
    ctx.fillStyle = '#ff9a4d';
    ctx.beginPath(); ctx.moveTo(rear, this.h/5); ctx.lineTo(rear-len, 0); ctx.lineTo(rear, -this.h/5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.moveTo(rear, this.h/10); ctx.lineTo(rear-len*0.55, 0); ctx.lineTo(rear, -this.h/10); ctx.closePath(); ctx.fill();
  }
}
