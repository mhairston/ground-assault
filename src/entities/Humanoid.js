import { CONFIG, GROUND_Y, W } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';

// same overall sprite height as the pilot (CONFIG.pilot.h), per Mike's request
export const HUMANOID_H = CONFIG.humanoid.height;

// Civilians. They flee toward the nearest building's door once a roamer hunting them closes to
// within fleeTriggerDist horizontally; if they make it, they're marked safe and can no longer be
// targeted/abducted. Between waves they instead wander off away from buildings for a while (see
// WaveManager.triggerComplete) — that state is handled first below and skips the flee logic entirely.
//
// Humans are scattered uniformly across the whole world rather than clustered in front of any
// particular building, per Mike's request. The same constructor serves the initial spawn as well as
// the falling-captive rescue/survive paths, so every humanoid carries the same fields.
export class Humanoid {
  constructor(x){
    this.x = x;
    this.alive = true;
    this.fleeing = false;
    this.targetBuilding = null;
    this.safe = false;
    this.counted = false;
    this.wandering = false;
    this.wanderDir = 1;
    this.wanderTimer = 0;
    this.roofRef = null;
    this.climbing = false;
    this.climbY = 0;
    this.roofSettleTimer = 0;
    this.animPhase = 0;
    this.moving = false;
    this.blinkTimer = 0;
  }

  // where this humanoid actually stands right now — ground level, a rooftop (if the ship dropped
  // them off up there), or partway down a ladder mid-climb. Read by drawing AND by roamers'
  // capture-altitude targeting, so both always agree on where the target really is instead of
  // roamers only ever diving to a hardcoded ground-level y.
  get topY(){
    if(this.climbing) return this.climbY;
    if(this.roofRef) return (GROUND_Y - this.roofRef.height) - HUMANOID_H;
    return GROUND_Y - HUMANOID_H;
  }

  // sent out to wander away from the nearest building during the between-wave lull
  startWanderingAwayFrom(building){
    this.safe = false; this.fleeing = false; this.targetBuilding = null;
    this.wandering = true;
    this.wanderDir = building ? (wrapDelta(building.x, this.x) >= 0 ? 1 : -1) : (Math.random()<0.5?-1:1);
    this.wanderTimer = CONFIG.humanoid.wanderTimerMin + Math.random()*CONFIG.humanoid.wanderTimerRandRange;
  }

  static updateAll(humanoids, dt, game){
    for(const h of humanoids) if(h.alive) h.update(dt, game);
    return humanoids;
  }

  update(dt, game){
    const FLEE_SPEED = CONFIG.humanoid.fleeSpeed; // roughly half the original 70, per Mike's request — civilians run more slowly
    const FLEE_TRIGGER_DIST = CONFIG.humanoid.fleeTriggerDist;
    const WANDER_SPEED = CONFIG.humanoid.wanderSpeed;
    const CLIMB_SPEED = CONFIG.humanoid.climbSpeed; // a rescued civilian dropped onto a rooftop climbing back down, per Mike's request

    // ticks down regardless of what other state the civilian is in — the "safely returned" blink (see
    // FallingCaptive's rescue/survive paths and draw() below) shouldn't depend on which branch below
    // they land in this frame
    if(this.blinkTimer > 0) this.blinkTimer -= dt;

    // a civilian mid-climb-down (see the roofSettleTimer logic just below) just keeps descending —
    // no fleeing/wandering/hunting-response while on the ladder, same as the player can't do anything
    // else mid-climb either. Not "moving" in the running-animation sense — climbing has its own pose.
    if(this.climbing){
      this.moving = false;
      this.climbY += CLIMB_SPEED*dt;
      const groundStand = GROUND_Y - HUMANOID_H;
      if(this.climbY >= groundStand){ this.climbY = groundStand; this.climbing = false; this.roofRef = null; }
      return;
    }

    // a civilian the ship dropped off on a rooftop (see FallingCaptive): they can walk around up
    // there and, after a short settle delay, will climb back down on their own — but only if that
    // building actually has a ladder (slanted-roof houses don't, see Building). No ladder just means
    // they're stuck up there for now, same as the player would be. They're still a valid roamer
    // target the whole time (see Roamer's capture-altitude logic, which reads their real position via
    // topY) — just can't proactively flee since there's nowhere to run to.
    if(this.roofRef){
      if(this.roofRef.destroyed){ this.roofRef = null; return; }
      if(this.roofSettleTimer > 0){
        this.roofSettleTimer -= dt;
        if(this.roofSettleTimer <= 0 && this.roofRef.hasLadder){
          this.climbing = true;
          this.climbY = (GROUND_Y - this.roofRef.height) - HUMANOID_H;
        }
      }
      this.moving = this.wandering;
      if(this.wandering){
        this.animPhase += dt*CONFIG.humanoid.animSpeed;
        const margin = CONFIG.pilot.rooftopClampMargin;
        const proposed = wrapX(this.x + this.wanderDir*WANDER_SPEED*dt);
        let d = wrapDelta(this.roofRef.x, proposed);
        d = Math.max(-(this.roofRef.width/2-margin), Math.min(this.roofRef.width/2-margin, d));
        this.x = wrapX(this.roofRef.x + d);
        this.wanderTimer -= dt;
        if(this.wanderTimer <= 0) this.wandering = false;
      } else this.animPhase = 0;
      return;
    }

    if(this.wandering){
      this.moving = true;
      this.animPhase += dt*CONFIG.humanoid.animSpeed;
      this.x = wrapX(this.x + this.wanderDir*WANDER_SPEED*dt);
      this.wanderTimer -= dt;
      if(this.wanderTimer <= 0) this.wandering = false;
      return;
    }
    if(this.safe){ this.moving = false; this.animPhase = 0; return; }
    if(!this.fleeing){
      const hunter = game.roamers.find(r => r.alive && r.target === this && Math.abs(wrapDelta(r.x, this.x)) < FLEE_TRIGGER_DIST);
      if(hunter){
        this.fleeing = true;
        this.targetBuilding = game.nearestBuilding(this.x).b;
        // rate-limited globally in the SoundManager (CONFIG.audio.civilianYelpGap): ten civilians
        // panicking at once should read as one cry of alarm, not ten
        game.sound.play('civilianDanger', { x: this.x });
      }
    }
    if(!this.fleeing){ this.moving = false; this.animPhase = 0; return; }
    if(!this.targetBuilding || this.targetBuilding.destroyed){
      this.fleeing = false; this.targetBuilding = null; this.moving = false; this.animPhase = 0;
      return;
    }
    const dx = wrapDelta(this.x, this.targetBuilding.doorX);
    this.moving = true;
    this.animPhase += dt*CONFIG.humanoid.animSpeed;
    this.x = wrapX(this.x + Math.sign(dx)*Math.min(Math.abs(dx), FLEE_SPEED*dt));
    if(Math.abs(dx) < CONFIG.humanoid.doorReachDist){
      // exactly at the door, per Mike's request, rather than left wherever the last step happened to land
      this.x = wrapX(this.targetBuilding.doorX);
      this.safe = true; this.fleeing = false; this.moving = false; this.animPhase = 0;
      game.sound.play('civilianSafe', { x: this.x });
      for(const r of game.roamers) if(r.target === this) r.target = null;
    }
  }

  static drawAll(humanoids, ctx, camera){
    for(const h of humanoids) if(h.alive) h.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx<-20||sx>W+20) return;
    // three quick blinks (alternating visible/invisible) when a captive has just been safely returned
    // to earth or a rooftop, instead of a debris burst — see FallingCaptive
    if(this.blinkTimer > 0 && Math.floor(this.blinkTimer/0.15)%2===0) return;
    const topY = this.topY; // ground, rooftop, or mid-ladder
    // safe (reached a building door and can no longer be abducted) reads as a calmer green instead of
    // the normal at-risk yellow — a quick visual confirmation of who's sheltered
    const color = this.safe ? '#8fffb0' : '#ffd76b';
    // same running-cycle treatment as the pilot (see Pilot.draw), and the same overall height
    // (HUMANOID_H, matching the pilot's h) — both per Mike's request
    const bodyH = 12, legH = HUMANOID_H - bodyH;
    const swing = this.moving ? Math.sin(this.animPhase) * 4.5 : 0;
    const bob = this.moving ? Math.abs(Math.sin(this.animPhase)) * 1.5 : 0;
    ctx.fillStyle = color;
    ctx.fillRect(sx-4, topY-bob, 8, bodyH);
    ctx.fillRect(sx-3+swing*0.6, topY+bodyH-bob, 3, legH);
    ctx.fillRect(sx  -swing*0.6, topY+bodyH-bob, 3, legH);
    ctx.fillStyle = '#fff3c9';
    ctx.fillRect(sx-3, topY-4-bob, 6, 6);
  }
}
