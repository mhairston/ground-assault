import { CONFIG, GROUND_Y, RAM_DAMAGES_BUILDINGS } from '../config.js';
import { wrapDelta } from '../core/geometry.js';

// Everything that resolves one thing hitting another, run once per tick after all the movement
// passes. Kept in one place (rather than spread across the entities) because most of these pairings
// have consequences on BOTH sides plus the score/wave bookkeeping in between.
export class CollisionSystem {
  constructor(game){ this.game = game; }

  run(){
    const game = this.game;
    this._bulletsVsRoamers(game);
    this._bulletsVsBombs(game);
    this._bulletsVsBombers(game);
    this._bulletsVsKamikazes(game);
    this._kamikazesVsEnemies(game);
    this._kamikazesVsBuildings(game);
    // player gunfire no longer damages buildings — it just passes through them harmlessly. The only
    // way to damage a building yourself is by ramming it with the ship (see _shipVsWorld).
    game.playerBullets = game.playerBullets.filter(b=>!b.dead);

    if(game.mode==='flight' && game.ship.alive && game.ship.invuln<=0) this._shipVsWorld(game);
    if(game.mode==='foot' && !game.pilot.hidden && game.pilot.invuln<=0){
      this._pilotVsBullets(game);
      this._kamikazesVsPilot(game);
    }
    this._enemyBulletsVsBuildings(game);
    game.enemyBullets = game.enemyBullets.filter(eb=>!eb.dead);
  }

  // Roamer gunfire wrecks the city it's shot over, per Mike's request — the same damage model bombs
  // use, so a stray round punches a hole and enough of them bring a building down. Note this is the
  // one thing on the board that damages buildings without the player being involved at all: roamers
  // strafe horizontally at whatever height they're hunting from, so a firefight along a street will
  // chew through the frontage whether or not the player is anywhere near it.
  //
  // Deliberately asymmetric with player fire, which passes through buildings harmlessly (see run()).
  // That asymmetry is the point: the player can't casually demolish their own city by missing, but
  // the enemy can, and a building lost still costs the player score (Building._collapse).
  _enemyBulletsVsBuildings(game){
    for(const eb of game.enemyBullets){
      if(eb.dead) continue;
      for(const bld of game.buildings){
        if(bld.destroyed) continue;
        // the building's silhouette is its footprint from roof to ground; a bullet inside that box
        // has hit the face of it
        if(Math.abs(wrapDelta(eb.x, bld.x)) >= bld.width/2) continue;
        if(eb.y < bld.roofY || eb.y > GROUND_Y) continue;
        eb.dead = true;
        bld.damage(eb.x, eb.y, game);
        break; // spent on the first thing it hits
      }
    }
  }

  _bulletsVsRoamers(game){
    for(const r of game.roamers){
      if(!r.alive) continue;
      for(const b of game.playerBullets){
        if(b.dead) continue;
        // vertical tolerance doubled along with the bullet's doubled height (see PlayerBullet.draw) —
        // a taller bullet is more likely to actually hit, per Mike's request. Head-only hit test, per
        // Mike's request — the bullet's trail no longer counts for killing enemies.
        if(b.headHit(r.x, r.y, CONFIG.roamer.bulletTolX, CONFIG.roamer.bulletTolY)){
          b.dead = true;
          game.killRoamer(r);
        }
      }
    }
  }

  _bulletsVsBombs(game){
    for(const bm of game.bombs){
      if(bm.exploded) continue;
      for(const b of game.playerBullets){
        if(b.dead) continue;
        if(b.trailHit(bm.x, bm.y, 9, 18)){
          bm.exploded = true; b.dead = true; game.addScore(CONFIG.scoring.perBombShotDown);
          game.sound.play('bombIntercept', { x: bm.x });
          // this bomb is filtered out of game.bombs below, before Bomb.updateAll ever runs again to
          // see it as exploded — so its whistle loop has to be released here, or it plays forever
          game.sound.stopLoop(bm);
          game.spawnDebris(bm.x, bm.y, '#ffd24d', 8);
        }
      }
    }
    game.bombs = game.bombs.filter(bm=>!bm.exploded);
  }

  _bulletsVsBombers(game){
    for(const bo of game.bombers){
      if(!bo.alive) continue;
      for(const b of game.playerBullets){
        if(b.dead) continue;
        // head-only hit test, per Mike's request — see PlayerBullet.headHit
        if(b.headHit(bo.x, bo.y, CONFIG.bomber.bulletTolX, CONFIG.bomber.bulletTolY)){
          b.dead = true;
          bo.hit(game);
        }
      }
    }
    game.bombers = game.bombers.filter(bo=>bo.alive);
  }

  _bulletsVsKamikazes(game){
    for(const k of game.kamikazes){
      if(!k.alive) continue;
      for(const b of game.playerBullets){
        if(b.dead) continue;
        if(b.headHit(k.x, k.y, CONFIG.kamikaze.bulletTolX, CONFIG.kamikaze.bulletTolY)){
          b.dead = true;
          game.killKamikaze(k);
        }
      }
    }
    game.kamikazes = game.kamikazes.filter(k=>k.alive);
  }

  // A kamikaze that touches ANY other enemy — a roamer, a bomber, or another kamikaze — detonates,
  // taking both out in one big blast (see Game.explodeKamikazeWith), per Mike's request: originally
  // just kamikaze-vs-kamikaze, now extended to every enemy type. Checked as a bounding-box overlap
  // using each pair's own w/h, same "hit box matches image size" treatment the ship itself got.
  // Each kamikaze only takes ONE other enemy with it per frame (roamer checked first, then bomber,
  // then another kamikaze) — the `continue` after a hit is what enforces that, so a kamikaze that
  // lands in the middle of a crowd doesn't chain-explode through all of it in a single tick.
  //
  // Only while actually pursuing a target (k.attacking), per Mike's request — an idle/patrolling
  // kamikaze just drifts past other enemies harmlessly, same as it drifts past the player without
  // triggering anything until it's committed to an attack run. Gated on the kamikaze doing the
  // checking, not the other party: a pursuing kamikaze detonates on anything it plows into, whether
  // or not THAT thing happens to be attacking anyone itself.
  _kamikazesVsEnemies(game){
    for(const k of game.kamikazes){
      if(!k.alive || !k.attacking) continue;
      let exploded = false;
      for(const r of game.roamers){
        if(!r.alive) continue;
        if(Math.abs(wrapDelta(k.x,r.x)) < (k.w+r.w)/2 && Math.abs(k.y-r.y) < (k.h+r.h)/2){
          game.explodeKamikazeWith(k, r, CONFIG.scoring.perRoamerKilled);
          // Deliberately NOT filtered out of game.roamers here (see the bottom of this method) and
          // NOT resolved-counted here either — r just sits alive===false in the array for the rest of
          // this tick, same as a bullet or ram kill, so the very next Roamer.updateAll/countResolved
          // pass picks it up exactly once, the same way every other roamer death is credited. Filtering
          // or crediting it here too would either double-count it there or (worse, as bullet kills
          // discovered) drop it from the array before that pass ever runs, so it's never credited at
          // all — see WaveManager.countResolved and the bug this used to cause.
          exploded = true;
          break;
        }
      }
      if(exploded) continue;
      for(const bo of game.bombers){
        if(!bo.alive) continue;
        if(Math.abs(wrapDelta(k.x,bo.x)) < (k.w+bo.w)/2 && Math.abs(k.y-bo.y) < (k.h+bo.h)/2){
          game.explodeKamikazeWith(k, bo, CONFIG.scoring.perBomberKilled);
          exploded = true;
          break;
        }
      }
      if(exploded) continue;
      for(const other of game.kamikazes){
        if(other === k || !other.alive) continue;
        if(Math.abs(wrapDelta(k.x,other.x)) < (k.w+other.w)/2 && Math.abs(k.y-other.y) < (k.h+other.h)/2){
          game.explodeKamikazeWith(k, other, CONFIG.scoring.perKamikazeKilled);
          break;
        }
      }
    }
    // Roamers are deliberately left out of this cleanup — see the comment above at the kamikaze-vs-
    // roamer check. game.bombers/game.kamikazes have no such wave-accounting contract to honor, so
    // they're filtered immediately as before.
    game.bombers = game.bombers.filter(bo=>bo.alive);
    game.kamikazes = game.kamikazes.filter(k=>k.alive);
  }

  // A kamikaze that touches a building destroys it immediately, per Mike's request — regardless of
  // remaining HP — and the kamikaze goes with it (see Game.explodeKamikazeIntoBuilding). The
  // building's footprint/altitude test is the same box the ship's own ram-a-building check uses
  // (RAM_DAMAGES_BUILDINGS, below), just without that check's extra edge/roof tolerances — a
  // kamikaze is small, so its own x/y is close enough. In practice this only ever fires during an
  // actual attack run: idle patrol sits well above rooftop height (see Kamikaze's spawnY), so a
  // kamikaze can't stumble into a building just by wandering.
  _kamikazesVsBuildings(game){
    for(const k of game.kamikazes){
      if(!k.alive) continue;
      for(const bld of game.buildings){
        if(bld.destroyed) continue;
        if(!bld.containsX(k.x)) continue;
        if(k.y < bld.roofY || k.y > GROUND_Y) continue;
        game.explodeKamikazeIntoBuilding(k, bld);
        break;
      }
    }
    game.kamikazes = game.kamikazes.filter(k=>k.alive);
  }

  _shipVsWorld(game){
    const ship = game.ship;
    // the ship's hit box is its actual image size, per Mike's request — half-width/half-height read
    // straight off ship.w/h rather than separately tuned (and previously smaller) tolerances
    const shipHalfW = ship.w/2, shipHalfH = ship.h/2;
    for(const r of game.roamers){
      if(r.alive && Math.abs(wrapDelta(ship.x,r.x)) < shipHalfW && Math.abs(ship.y-r.y) < shipHalfH){
        // crashing into a roamer destroys both — the ship (loseLife, same as any other hit) and the
        // roamer itself, same debris/falling-captive handling as a clean bullet kill
        game.killRoamer(r);
        game.loseLife();
        break; // ship is destroyed/respawning now — no need to check the rest this tick
      }
    }
    for(const bo of game.bombers){
      if(bo.alive && Math.abs(wrapDelta(ship.x,bo.x)) < shipHalfW && Math.abs(ship.y-bo.y) < shipHalfH){
        game.killBomber(bo);
        game.loseLife();
        break;
      }
    }
    for(const k of game.kamikazes){
      if(k.alive && Math.abs(wrapDelta(ship.x,k.x)) < shipHalfW && Math.abs(ship.y-k.y) < shipHalfH){
        // this is the whole point of a kamikaze — it rams on contact same as a roamer/bomber would,
        // just far more eagerly since it's been actively steering toward exactly this
        game.killKamikaze(k);
        game.loseLife();
        break;
      }
    }
    for(const eb of game.enemyBullets){
      if(!eb.dead && Math.abs(wrapDelta(eb.x,ship.x)) < shipHalfW && Math.abs(eb.y-ship.y) < shipHalfH){
        eb.dead = true; game.loseLife();
      }
    }
    // ramming a building: destroys the ship (same life-loss/respawn as any other hit) and damages
    // the building it hit, using the same damage model bombs use — configurable, off by default
    // (see RAM_DAMAGES_BUILDINGS)
    if(RAM_DAMAGES_BUILDINGS){
      for(const bld of game.buildings){
        if(bld.destroyed) continue;
        const roofY = GROUND_Y - bld.height;
        if(Math.abs(wrapDelta(ship.x,bld.x)) < bld.width/2 + CONFIG.building.ramTolXPastEdge && ship.y > roofY - CONFIG.building.ramTolYAboveRoof && ship.y < GROUND_Y + CONFIG.building.ramTolYBelowGround){
          bld.damage(ship.x, ship.y, game);
          game.loseLife();
          break;
        }
      }
    }
  }

  _pilotVsBullets(game){
    const pilot = game.pilot;
    const footMidY = pilot.midY;
    for(const eb of game.enemyBullets){
      if(!eb.dead && Math.abs(wrapDelta(eb.x,pilot.x)) < 8 && Math.abs(eb.y-footMidY) < 12){ eb.dead = true; game.loseLife(); }
    }
  }

  // A kamikaze that reaches the on-foot pilot kills them and destroys itself, per Mike's request —
  // same tolerance box as _pilotVsBullets above, since neither is meant to be a different size than
  // the other things that already threaten the pilot on foot.
  _kamikazesVsPilot(game){
    const pilot = game.pilot;
    const footMidY = pilot.midY;
    for(const k of game.kamikazes){
      if(k.alive && Math.abs(wrapDelta(pilot.x,k.x)) < 8 && Math.abs(footMidY-k.y) < 12){
        game.explodeKamikazeIntoPilot(k);
        break; // pilot is dead/respawning now — no need to check the rest this tick
      }
    }
  }
}
