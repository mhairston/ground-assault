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
    // player gunfire no longer damages buildings — it just passes through them harmlessly. The only
    // way to damage a building yourself is by ramming it with the ship (see _shipVsWorld).
    game.playerBullets = game.playerBullets.filter(b=>!b.dead);

    if(game.mode==='flight' && game.ship.alive && game.ship.invuln<=0) this._shipVsWorld(game);
    if(game.mode==='foot' && !game.pilot.hidden && game.pilot.invuln<=0) this._pilotVsBullets(game);
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
          game.killBomber(bo);
        }
      }
    }
    game.bombers = game.bombers.filter(bo=>bo.alive);
  }

  _shipVsWorld(game){
    const ship = game.ship;
    for(const r of game.roamers){
      if(r.alive && Math.abs(wrapDelta(ship.x,r.x)) < CONFIG.ship.ramRoamerTolX && Math.abs(ship.y-r.y) < CONFIG.ship.ramRoamerTolY){
        // crashing into a roamer destroys both — the ship (loseLife, same as any other hit) and the
        // roamer itself, same debris/falling-captive handling as a clean bullet kill
        game.killRoamer(r);
        game.loseLife();
        break; // ship is destroyed/respawning now — no need to check the rest this tick
      }
    }
    for(const bo of game.bombers){
      if(bo.alive && Math.abs(wrapDelta(ship.x,bo.x)) < CONFIG.ship.ramBomberTolX && Math.abs(ship.y-bo.y) < CONFIG.ship.ramBomberTolY){
        game.killBomber(bo);
        game.loseLife();
        break;
      }
    }
    for(const eb of game.enemyBullets){
      if(!eb.dead && Math.abs(wrapDelta(eb.x,ship.x)) < CONFIG.ship.enemyBulletTolX && Math.abs(eb.y-ship.y) < CONFIG.ship.enemyBulletTolY){
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
}
