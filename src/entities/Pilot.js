import { CONFIG, GROUND_Y, INTERIOR_ENABLED } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';
import { PlayerBullet } from './Bullet.js';

// The on-foot player: runs along the ground and across rooftops, climbs ladders, shoots straight up,
// and carries the pickup stash (which the ship's superbomb key also draws from — same shared stash).
//
// Boarding the ship is NOT handled here: it's an explicit A press routed through
// Game.tryBoardOrLand(), so a held key can't re-trigger it frame after frame.
export class Pilot {
  constructor(x){
    this.w = CONFIG.pilot.w;
    this.h = CONFIG.pilot.h;
    this.reset(x);
  }

  reset(x){
    this.x = x;
    this.y = GROUND_Y - this.h;
    this.vx = 0;
    this.facing = 1;
    this.climbing = false;
    this.ladderRef = null;
    this.roofRef = null;
    this.invuln = 0;
    this.animPhase = 0;
    this.superbombCount = 0;
    this.fireSuppressantCount = 0;
    this.hidden = false;
    this.shootCooldown = 0;
  }

  get midY(){ return this.y + this.h/2; }

  // called when the ship sets down: the pilot steps out onto whatever surface it landed on
  landAt(x, surface){
    this.x = x;
    this.y = surface.topY - this.h;
    this.roofRef = surface.roofRef;
    this.climbing = false;
  }

  // a building coming down under the player drops them to the street (see Building._collapse)
  dropFrom(building){
    if(this.roofRef === building){ this.roofRef = null; this.y = GROUND_Y - this.h; }
    if(this.ladderRef === building && this.climbing){ this.climbing = false; this.y = GROUND_Y - this.h; }
  }

  shoot(game){
    game.playerBullets.push(new PlayerBullet(this.x, this.y-4, 0, -CONFIG.pilot.bulletSpeed, true));
    game.sound.play('footLaser');
  }

  update(dt, game){
    const input = game.input;
    if(this.invuln>0) this.invuln -= dt;

    // shooting straight up works in every on-foot substate (ground, rooftop, even mid-climb)
    if(this.shootCooldown>0) this.shootCooldown -= dt;
    if(input.isDown('Space') && this.shootCooldown<=0){ this.shoot(game); this.shootCooldown = CONFIG.pilot.shootCooldown; }

    // carried items — usable from any on-foot substate; each is consumed on a successful use
    // (the fire-suppressant check bails out with no effect, and no consumption, if there's no
    // valid damaged building nearby, so it's never wasted on a bad press)
    if(input.isDown('KeyS') && this.superbombCount>0) game.useSuperbomb();
    if(input.isDown('KeyF') && this.fireSuppressantCount>0) game.useFireSuppressant();

    const speed = CONFIG.pilot.speed; // 110 * 1.4 — on-foot movement is 40% faster than the original prototype

    if(this.climbing){ this._updateClimbing(dt, game, speed); return; }
    if(this.roofRef) this._updateOnRooftop(dt, game, speed);
    else this._updateOnGround(dt, game, speed);
  }

  _updateClimbing(dt, game, speed){
    const input = game.input;
    this.vx = 0;
    const climbDir = (input.isDown('ArrowDown') ? 1 : 0) - (input.isDown('ArrowUp') ? 1 : 0);
    this.y += climbDir * speed * CONFIG.pilot.ladderClimbSpeedFactor * dt;
    // hand-over-hand cycle, advanced only while actually moving on the ladder. Unlike the walk cycle
    // this is never reset to zero: a pilot pausing mid-climb simply stops advancing and so holds
    // whatever grip they had, rather than snapping back to a fixed pose — which is what hanging on
    // a ladder looks like.
    if(climbDir !== 0){
      this.animPhase += dt*CONFIG.pilot.climbAnimSpeed;
      // rate-limited in the SoundManager rather than tied to the animation phase — the tick just
      // needs to read as a steady metallic rhythm while climbing, not land exactly on a rung
      game.sound.play('climbTick', { x: this.x });
    }
    const b = this.ladderRef;
    const roofStand = b.standY(this.h), groundStand = GROUND_Y - this.h;
    // the ladder extends past the roofline (see Building._drawLadder), so climbing tops out with feet
    // ON the roof, not hanging in front of the top floor
    if(this.y <= roofStand){ this.y = roofStand; this.climbing = false; this.roofRef = b; }
    if(this.y >= groundStand){ this.y = groundStand; this.climbing = false; this.roofRef = null; }
    game.camera.follow(this.x);
  }

  _updateOnRooftop(dt, game, speed){
    const input = game.input;
    const b = this.roofRef;
    this.vx = 0;
    if(input.isDown('ArrowLeft')){ this.vx=-speed; this.facing=-1; }
    if(input.isDown('ArrowRight')){ this.vx=speed; this.facing=1; }
    this.animPhase = this.vx !== 0 ? this.animPhase + dt*CONFIG.pilot.animSpeed : 0;
    if(this.vx !== 0) game.sound.play('footstep', { x: this.x });
    const proposed = wrapX(this.x + this.vx*dt);
    const margin = CONFIG.pilot.rooftopClampMargin;
    let d = wrapDelta(b.x, proposed);
    d = Math.max(-(b.width/2-margin), Math.min(b.width/2-margin, d));
    this.x = wrapX(b.x + d);
    this.y = b.standY(this.h);
    game.camera.follow(this.x);
    const ladderDist = Math.abs(wrapDelta(this.x, b.x));
    // tightened from 14px to 8px, per Mike's request that the pilot has to actually be close to a
    // ladder before Up/Down starts climbing it
    if(b.hasLadder && ladderDist < CONFIG.pilot.ladderProximity && input.isDown('ArrowDown')){
      this.climbing = true; this.ladderRef = b; this.roofRef = null;
    }
    // NOTE: no early return above — the ship can be parked on a rooftop, so a player standing up
    // there needs to be able to board it too (see Game.tryBoardOrLand, on the A key).
  }

  _updateOnGround(dt, game, speed){
    const input = game.input;
    this.vx = 0;
    if(input.isDown('ArrowLeft')){ this.vx=-speed; this.facing=-1; }
    if(input.isDown('ArrowRight')){ this.vx=speed; this.facing=1; }
    this.animPhase = this.vx !== 0 ? this.animPhase + dt*CONFIG.pilot.animSpeed : 0;
    if(this.vx !== 0) game.sound.play('footstep', { x: this.x });
    this.x = wrapX(this.x + this.vx*dt);
    this.y = GROUND_Y - this.h;
    game.camera.follow(this.x);

    const {b,d} = game.nearestBuilding(this.x);
    // tightened from 14px to 8px, per Mike's request that the pilot has to actually be close to a
    // ladder before Up starts climbing it
    if(b && !b.destroyed && b.hasLadder && d < CONFIG.pilot.ladderProximity && input.isDown('ArrowUp')){
      this.climbing = true; this.ladderRef = b;
    }

    const doorDist = (b && !b.destroyed) ? Math.abs(wrapDelta(this.x, b.doorX)) : 999;
    if(INTERIOR_ENABLED && b && !b.destroyed && doorDist < CONFIG.pilot.doorProximity && input.isDown('ArrowDown')){
      game.enterInterior(b);
    }
  }

  draw(ctx, camera){
    if(this.hidden) return;
    const sx = relX(camera.x, this.x);
    if(this.invuln>0 && Math.floor(this.invuln*20)%2===0) ctx.globalAlpha=0.3;
    if(this.climbing) this._drawClimbing(ctx, sx);
    else this._drawOnFoot(ctx, sx);
    ctx.globalAlpha = 1;
  }

  _drawOnFoot(ctx, sx){
    const bodyH = 12, legH = this.h - bodyH;
    // simple running cycle: legs scissor opposite each other, torso bobs slightly on every stride —
    // settles back to a neutral standing pose the instant the player stops
    const moving = this.vx !== 0;
    const swing = moving ? Math.sin(this.animPhase) * 4.5 : 0;
    const bob = moving ? Math.abs(Math.sin(this.animPhase)) * 1.5 : 0;

    ctx.fillStyle = '#ff8b5e';
    ctx.fillRect(sx-4, this.y-bob, 8, bodyH);
    ctx.fillRect(sx-3+swing*0.6, this.y+bodyH-bob, 3, legH);
    ctx.fillRect(sx  -swing*0.6, this.y+bodyH-bob, 3, legH);
    ctx.fillStyle = '#ffd8c2'; ctx.fillRect(sx-3, this.y-4-bob, 6, 6);
  }

  // Climbing gets its own pose rather than the running one, per Mike's request: seen face-on against
  // the ladder, arms reaching for rungs and legs stepping opposite them, so a climb reads as a climb
  // and not as someone running on the spot. The arms are the tell — they only exist in this pose.
  // A pilot who stops mid-ladder freezes wherever the cycle left them, still gripping (see
  // _updateClimbing), instead of settling to a neutral stance the way a stopped walk does.
  _drawClimbing(ctx, sx){
    const bodyH = 12, legH = this.h - bodyH;
    const reach = Math.sin(this.animPhase); // frozen wherever it stopped when the player isn't climbing

    ctx.fillStyle = '#ff8b5e';
    ctx.fillRect(sx-4, this.y, 8, bodyH);                                    // torso: the ladder holds it steady, no bob
    ctx.fillRect(sx-3, this.y+bodyH+reach*2, 3, legH-Math.abs(reach));       // legs step in opposition...
    ctx.fillRect(sx,   this.y+bodyH-reach*2, 3, legH-Math.abs(reach));
    ctx.fillRect(sx-6, this.y-2-reach*3, 2, 7);                              // ...to the arms hauling on the rungs
    ctx.fillRect(sx+4, this.y-2+reach*3, 2, 7);
    ctx.fillStyle = '#ffd8c2'; ctx.fillRect(sx-3, this.y-4, 6, 6);
  }
}
