import { wrapDelta } from './geometry.js';

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
  }

  follow(newX){
    this.continuousX += wrapDelta(this.x, newX);
    this.x = newX;
  }

  reset(x){
    this.x = x;
    this.continuousX = x;
  }
}
