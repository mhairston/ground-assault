import { CONFIG, W } from '../config.js';
import { relX, wrapDelta } from '../core/geometry.js';

const BOMB_FALL_SPEED = CONFIG.bomb.fallSpeed;

// Bombs fall at a constant rate toward their target — a building's roof, or straight at the ground
// under an on-foot player — per Mike's request (previously they accelerated under light gravity).
// The player can shoot them down in flight, or from the ground/rooftop, before they land. A bomb
// that lands on a building damages it exactly like ship-ramming does; one that lands on open ground
// leaves a scorch mark, and either kind can kill a civilian or the pilot caught in the blast radius.
export class Bomb {
  constructor(x, y, targetY, targetBuilding){
    this.x = x;
    this.y = y;
    this.startY = y; // where the fall began, so the whistle knows how far along it is
    this.targetY = targetY;
    this.targetBuilding = targetBuilding;
    this.exploded = false;
  }

  static updateAll(bombs, dt, game){
    for(const bm of bombs) bm.y += BOMB_FALL_SPEED*dt;
    for(const bm of bombs){
      if(bm.exploded) continue;
      if(bm._directHitPlayer(game)) continue;
      if(bm.y >= bm.targetY) bm.explode(game);
    }
    const alive = bombs.filter(bm => !bm.exploded);
    // Each falling bomb carries its own whistle, rising in pitch as it closes on its target — often
    // the only warning that something is coming down on you from above the top of the screen. Wound
    // up here rather than at the explosion sites because a bomb has several ways to leave play (it
    // lands, it hits the player, a bullet knocks it out), and this is the one place that sees them
    // all — no exit path can leave a whistle screaming over an empty sky.
    for(const bm of bombs){
      if(bm.exploded){ game.sound.stopLoop(bm); continue; }
      const fall = bm.targetY - bm.startY;
      game.sound.startLoop('bombWhistle', bm);
      game.sound.setLoop(bm, {
        progress: fall > 0 ? Math.max(0, Math.min(1, (bm.y - bm.startY)/fall)) : 1,
        x: bm.x,
      });
    }
    return alive;
  }

  // A bomb that runs bodily into the player detonates on contact — it doesn't get quietly deleted.
  // The life is taken here (a direct hit is a hit regardless of where the blast reaches), then the
  // bomb explodes normally with the player-blast pass skipped so the same bomb can't cost two lives.
  _directHitPlayer(game){
    const ship = game.ship, pilot = game.pilot;

    // Direct bomb-body collision while in flight.
    if(game.mode==='flight' && ship.alive && ship.invuln<=0){
      const hitShipX = Math.abs(wrapDelta(ship.x, this.x)) < CONFIG.bomb.directHitShipTolX;
      const hitShipY = Math.abs(ship.y - this.y) < CONFIG.bomb.directHitShipTolY;
      if(hitShipX && hitShipY){
        game.loseLife();
        this.explode(game, true);
        return true;
      }
    }

    // Direct bomb-body collision while on foot (ground/roof/ladder).
    if(game.mode==='foot' && !pilot.hidden && pilot.invuln<=0){
      const hitPilotX = Math.abs(wrapDelta(pilot.x, this.x)) < CONFIG.bomb.directHitPilotTolX;
      const hitPilotY = Math.abs(pilot.midY - this.y) < CONFIG.bomb.directHitPilotTolY;
      if(hitPilotX && hitPilotY){
        game.loseLife();
        this.explode(game, true);
        return true;
      }
    }

    return false;
  }

  // skipPlayerBlast is set only by _directHitPlayer, which has already taken the life.
  explode(game, skipPlayerBlast = false){
    this.exploded = true;
    // Where the blast actually goes off. A bomb that reached its target (the normal path, and a
    // direct hit on a player standing/hovering right at the impact point) detonates at targetY and
    // does the full job: crater or scorch, plus the blast sweep. A bomb intercepted higher up goes
    // off in mid-air instead — debris and a radial blast at the bomb's own position, but nothing
    // reaches the building or the ground below, so blocking a bomb with the ship still saves what
    // was under it.
    const atTarget = this.y >= this.targetY - CONFIG.bomb.blastYTol;
    const impactY = atTarget ? this.targetY : this.y;
    // capture blast-relevance BEFORE damaging the building — a destroying hit clears the pilot's
    // roofRef, which would otherwise make us miss that the player was standing right there
    const footWasOnThisRoof = this.targetBuilding && game.pilot.roofRef === this.targetBuilding;
    // dirt-brown debris only for a blast that actually hit open ground — a mid-air detonation isn't
    // kicking up any earth, so it gets the plain explosion orange
    game.spawnDebris(this.x, impactY, (atTarget && !this.targetBuilding) ? '#c98a4d' : '#ff9a4d', CONFIG.bomb.debrisOnExplode);
    // the hole punched into a building lands slightly off from the bomb's exact impact point —
    // a small random jitter so repeated hits don't all land in precisely the same spot
    if(atTarget){
      if(this.targetBuilding){
        this.targetBuilding.damage(
          this.x + (Math.random()-0.5)*CONFIG.bomb.holeJitterX,
          this.targetY + (Math.random()-0.5)*CONFIG.bomb.holeJitterY,
          game
        );
      } else {
        game.scorches.add(this.x, this.targetY);
      }
    }
    // a mid-air interception gets the ground-impact thud too — quieter and duller than a real hit,
    // but it still detonated, so silence would read as the bomb simply vanishing
    game.sound.play(atTarget && this.targetBuilding ? 'bombHitBuilding' : 'bombHitGround', { x: this.x });
    if(!skipPlayerBlast) this._blastPlayer(game, footWasOnThisRoof, impactY);
    this._blastCivilians(game, impactY);
  }

  _blastPlayer(game, footWasOnThisRoof, impactY){
    const ship = game.ship, pilot = game.pilot;
    if(game.mode==='flight' && ship.alive && ship.invuln<=0 && Math.abs(wrapDelta(ship.x,this.x))<30 && Math.abs(ship.y-impactY)<CONFIG.bomb.blastYTol){
      game.loseLife();
      return;
    }
    if(game.mode==='foot' && !pilot.hidden && pilot.invuln<=0){
      if(this.targetBuilding){
        if(footWasOnThisRoof && Math.abs(wrapDelta(pilot.x,this.x))<CONFIG.bomb.blastXTol) game.loseLife();
      } else if(!pilot.roofRef && !pilot.climbing && Math.abs(wrapDelta(pilot.x,this.x))<CONFIG.bomb.blastXTol){
        game.loseLife();
      }
    }
  }

  // civilians caught in the blast radius die too — checked against wherever they actually are
  // (ground, rooftop, or mid-ladder) via Humanoid's topY, so only civilians on the roof actually
  // being hit (or on the ground under a ground-targeted bomb) die, not everyone in the building's x
  // range regardless of altitude. This is a true circular radius (per Mike's request: "the blast
  // should be about 50px in all directions") rather than a separate x/y box — measured as actual
  // radial distance from the impact point, independent of the building/ship blast tolerances above,
  // which are unchanged.
  _blastCivilians(game, impactY){
    for(const h of game.humanoids){
      if(h.alive && Math.hypot(wrapDelta(h.x,this.x), h.topY-impactY) < CONFIG.bomb.humanBlastRadius){
        h.alive = false;
        game.loseHumanoid(h, 'killed');
      }
    }
  }

  static drawAll(bombs, ctx, camera){
    for(const bm of bombs) bm.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    // pulsing warning ring at the impact point, so it's readable before the bomb arrives — anchored
    // to the target building if there is one, otherwise to the bomb's own ground-targeted x
    const ringX = this.targetBuilding ? this.targetBuilding.x : this.x;
    const rsx = relX(camera.x, ringX);
    if(rsx > -20 && rsx < W+20){
      const pulse = 6 + 4*Math.sin(performance.now()/120);
      ctx.strokeStyle = 'rgba(255,106,61,0.5)';
      ctx.beginPath(); ctx.arc(rsx, this.targetY, pulse, 0, Math.PI*2); ctx.stroke();
    }
    if(sx<-20||sx>W+20) return;
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath(); ctx.arc(sx, this.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffb37a';
    ctx.beginPath(); ctx.moveTo(sx,this.y-5); ctx.lineTo(sx,this.y-10); ctx.stroke();
  }
}
