import { CONFIG } from '../config.js';
import { wrapDelta, wrapX } from './geometry.js';

// The camera tracks whichever thing the player is currently controlling.
//
// `x` itself wraps at the world seam (needed for relX/collision math), which made a jump of ~WORLD_W
// happen the instant the player crossed x=0/WORLD_W — visually that showed up as the parallax
// mountains "resetting" at the seam. `continuousX` tracks the exact same camera position but never
// wraps, by always accumulating the shortest signed delta (wrapDelta) between the old and new x;
// background rendering reads that instead so it drifts smoothly through the seam with nothing to see.
export class Camera {
  constructor(x){
    this.x = x;
    this.continuousX = x;
    this.drifting = false;
  }

  follow(newX){
    this.continuousX += wrapDelta(this.x, newX);
    this.x = newX;
  }

  reset(x){
    this.x = x;
    this.continuousX = x;
    this.cancelDrift();
  }

  // ---- death drift ---------------------------------------------------------
  // When the ship is destroyed there's nothing left to follow, and freezing the camera where the
  // ship happened to be throws away the most interesting part of the explosion: the wreckage is
  // still carrying the ship's momentum (see Fragment). So the camera goes with the debris instead,
  // per Mike's request, and stops driftStopTime after the last fragment burns out.
  //
  // It flies the cloud's motion rather than chasing it. Every fragment starts at the ship's speed
  // times momentumInherit — their individual outward bursts point every which way and cancel out
  // across the cloud — and is then dragged down by exactly the law in DebrisField.update. Running
  // that same law here puts the camera on the cloud's centre by construction: no lag to catch up, no
  // gain to tune, and nothing that can lose track of it. Steering off the live fragment list (an
  // earlier version of this) is what invites the failure where the camera coasts a moment and stops
  // while the debris sails on — anything that makes the list unreadable degrades to exactly that.
  // cloudLife is when this explosion's last fragment burns out, measured once at spawn and handed
  // over here rather than discovered by watching the fragments go
  followWreckage(shipVx, cloudLife){
    this.driftVx = shipVx * CONFIG.debris.momentumInherit;
    this.driftTime = 0;
    this.cloudLife = cloudLife;
    this.drifting = true;
  }

  cancelDrift(){ this.drifting = false; }

  update(dt){
    if(!this.drifting) return;
    this.driftTime += dt;
    this.driftVx *= Math.pow(CONFIG.debris.drag, dt); // the fragments' own air drag, same formula
    // Once the cloud is gone there is nothing left to follow: ramp whatever speed remains linearly
    // to zero, arriving at a dead stop exactly driftStopTime after the last of it disappears.
    const past = this.driftTime - this.cloudLife;
    const ramp = past <= 0 ? 1 : Math.max(0, 1 - past/CONFIG.camera.driftStopTime);
    this.follow(wrapX(this.x + this.driftVx*ramp*dt));
    if(ramp <= 0) this.cancelDrift();
  }
}
