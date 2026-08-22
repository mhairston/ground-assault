import { CONFIG, W, H, GROUND_Y, WORLD_W } from './config.js';
import { relX, wrapX, wrapDelta } from './core/geometry.js';
import { Camera } from './core/Camera.js';
import { Input } from './core/Input.js';
import { Hud } from './core/Hud.js';
import { HighScores } from './core/HighScores.js';
import { Building } from './entities/Building.js';
import { Humanoid } from './entities/Humanoid.js';
import { Pilot } from './entities/Pilot.js';
import { Ship } from './entities/Ship.js';
import { Roamer } from './entities/Roamer.js';
import { Bomber } from './entities/Bomber.js';
import { Kamikaze } from './entities/Kamikaze.js';
import { Bomb } from './entities/Bomb.js';
import { PlayerBullet, EnemyBullet } from './entities/Bullet.js';
import { FallingCaptive } from './entities/FallingCaptive.js';
import { DebrisField } from './entities/Debris.js';
import { PickupField } from './entities/Pickup.js';
import { ScorchField } from './entities/GroundScorch.js';
import { Interior } from './entities/Interior.js';
import { WaveManager } from './systems/WaveManager.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { RespawnSequence } from './systems/RespawnSequence.js';
import { Renderer } from './render/Renderer.js';
import { SoundManager } from './audio/SoundManager.js';

// The world. Owns every entity list and the shared game state (mode, score, lives), and is passed to
// entities as the one handle they need for anything outside themselves. Update logic that belongs to
// a single kind of thing lives on that class; what lives here is the wiring: tick order, the
// cross-cutting choke points (score, civilian losses, life loss), and the mode transitions.
export class Game {
  constructor(canvas, doc = document){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hud = new Hud(doc);
    this.highScores = new HighScores();

    this.shipPad = { x: CONFIG.shipPad.x, y: GROUND_Y };
    this.pilot = new Pilot(wrapX(this.shipPad.x - CONFIG.pilot.startOffsetFromShip));
    this.ship = new Ship(this.shipPad);
    this.interior = new Interior();
    this.camera = new Camera(this.pilot.x);
    this.waves = new WaveManager(this);
    this.debris = new DebrisField();
    this.pickups = new PickupField();
    this.scorches = new ScorchField();
    this.collisions = new CollisionSystem(this);
    this.renderer = new Renderer(this.ctx, this);
    this.sound = new SoundManager(this.camera);

    this.input = new Input(doc.getElementById('speedSelect'), {
      onBoardOrLand: () => this.tryBoardOrLand(),
      // P restarts the game once it's over; any other time it's underway, it pauses/unpauses instead
      onP: () => {
        // unlock before playing the restart cue — sound.locked is still true here, set at GAME OVER
        // (see loseLife), and reset() itself clears it defensively but only runs afterward
        if(this.gameOver){ this.sound.locked = false; this.sound.play('restart'); this.reset(); }
        else this.togglePause();
      },
      // Browsers block audio until the page has been interacted with, so the very first keypress is
      // what builds the AudioContext — and the drum track can only start once it exists. Skipped while
      // paused so that mashing some other key can't accidentally resume the audio context out from
      // under an intentional pause — only the P handler above (via togglePause) may do that.
      onGesture: () => {
        if(this.paused) return;
        const fresh = this.sound.ctx === null;
        this.sound.unlock();
        if(fresh && !this.gameOver) this.sound.startMusic();
      },
      onMute: () => this.hud.setAudio(this.sound.toggleMute()),
    });

    // Switching tabs/apps auto-pauses, per Mike's request — otherwise the whole world (roamers,
    // bombs, the clock) keeps running unseen and unheard while the player's away. Deliberately does
    // NOT auto-resume on return: that stays an explicit P, so nothing lurches back into motion the
    // instant focus comes back.
    doc.addEventListener('visibilitychange', () => {
      if(doc.hidden && !this.gameOver && !this.paused) this.togglePause();
    });

    this.reset();
  }

  // Full game setup, used both at load and for the in-place restart on P, per Mike's request —
  // instead of requiring a page refresh. Kept as one function (rather than a separate init +
  // restart) so the two can't drift out of sync; nothing here tears down the canvas, listeners, or
  // localStorage high scores.
  reset(){
    this.buildings = CONFIG.buildings.map(b => new Building(b));
    this.humanoids = [];
    for(let i=0;i<CONFIG.humanoid.count;i++) this.humanoids.push(new Humanoid(wrapX(Math.random()*WORLD_W)));

    // The game opens in the air, flying, rather than on foot beside the parked ship, per Mike's
    // request. Deliberately the same placement an airborne respawn uses (see finishRespawn) so
    // there's one notion of "dropped into flight at mid-altitude": over the pad, at H/2, with the
    // usual spawn invulnerability. ship.reset() still runs first so the parked/gear state underneath
    // is clean, and the pilot is still reset (100px left of the pad, per Mike's earlier request) —
    // that position simply isn't used until the player lands somewhere, which re-places them.
    this.mode = 'flight'; // 'foot' | 'interior' | 'flight'
    this.pilot.reset(wrapX(this.shipPad.x - CONFIG.pilot.startOffsetFromShip));
    this.ship.reset();
    this.ship.respawnAirborne(this.shipPad.x, H/2);
    this.interior.reset();
    this.camera.reset(this.ship.x);

    this.score = 0;
    this.lives = CONFIG.player.startingLives;
    this.gameOver = false;
    this.gameOverDisplayTimer = 0; // counts down after the final death — see loseLife and Renderer.drawGameOver
    this.paused = false;
    this.finalHighScores = null;
    this.finalScore = null;
    this.hud.setScore(this.score);
    this.hud.setLives(this.lives);

    this.roamers = [];
    this.bombers = [];
    this.kamikazes = [];
    this.bombs = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.fallingCaptives = [];
    this.debris.clear();
    this.pickups.reset();
    this.scorches.clear();
    this.bomberRespawn = CONFIG.bomber.initialRespawnTimer;
    this.kamikazeRespawn = CONFIG.kamikaze.initialRespawnTimer;
    this.superbombFlash = 0;
    // every loop belongs to something that no longer exists after a restart — engine hum, enemy
    // drones, the whistle of bombs that were in the air — so they all go rather than hanging on
    if(this.sound){
      this.sound.locked = false;
      this.sound.stopAllLoops();
      this.sound.setMusicWave(1);
      this.sound.startMusic(); // no-op if the context isn't unlocked yet, or if it's already running
      this.hud.setAudio(this.sound.muted);
    }
    this.respawn = null;

    this.waves.reset();
    this.waves.releaseRoamers();
  }

  // ---- shared choke points -------------------------------------------------

  // every score change goes through here so it's clamped at zero (negative scores are never
  // allowed, per Mike's request) instead of every call site having to remember to clamp itself
  addScore(delta){
    this.score = Math.max(0, this.score + delta);
    this.hud.setScore(this.score);
  }

  // srcVx/srcVy: the velocity of whatever was destroyed, which its fragments fly away carrying a
  // share of (see Fragment). Omitted by everything that blows up from a standstill — building hits,
  // bomb impacts, ground explosions.
  // returns when this explosion will be over (see DebrisField.spawn) — ignored by most callers
  spawnDebris(x, y, color, count, srcVx = 0, srcVy = 0){ return this.debris.spawn(x, y, color, count, srcVx, srcVy); }

  spawnFallingCaptive(x, y){ this.fallingCaptives.push(new FallingCaptive(x, y)); }

  // a human is only ever scored/counted once, even if (e.g.) an already-abducted captive is later
  // also caught in a building-destruction blast
  loseHumanoid(h, kind){ // kind: 'abducted' | 'killed'
    if(h.counted) return;
    h.counted = true;
    this.addScore(CONFIG.scoring.perHumanLost);
    this.sound.play('civilianLost', { x: h.x });
    if(kind === 'abducted') this.waves.recordCivAbduction();
    else this.waves.recordCivDeath();
  }

  // one destroy path for roamers and one for bombers, shared by bullet kills and ram kills so the
  // score, debris, wave accounting and captive-drop can't drift apart between them
  killRoamer(r){
    r.alive = false;
    this.addScore(CONFIG.scoring.perRoamerKilled); // a ramming kill counts the same as a shot-down one
    this.spawnDebris(r.x, r.y, '#c98bff', CONFIG.debris.enemyKillCount, r.vx, r.vy); // doubled, per Mike's request for more debris when enemies are destroyed
    this.sound.play('roamerDeath', { x: r.x });
    this.waves.recordEnemyDestroyed();
    if(r.carrying) this.spawnFallingCaptive(r.x, r.y);
  }

  killBomber(bo){
    bo.alive = false;
    this.addScore(CONFIG.scoring.perBomberKilled);
    this.spawnDebris(bo.x, bo.y, '#ff8a4d', CONFIG.debris.enemyKillCount, bo.vx, bo.vy);
    this.sound.play('bomberDeath', { x: bo.x });
    this.waves.recordEnemyDestroyed();
  }

  killKamikaze(k){
    k.alive = false;
    this.addScore(CONFIG.scoring.perKamikazeKilled);
    this.spawnDebris(k.x, k.y, '#ff3b3b', CONFIG.debris.enemyKillCount, k.vx, k.vy);
    this.sound.play('kamikazeDeath', { x: k.x });
    this.waves.recordEnemyDestroyed();
  }

  // A kamikaze that touches ANY other enemy — another kamikaze, a roamer, or a bomber — detonates,
  // taking both out in one much bigger blast than either dies with alone, per Mike's request
  // (originally just kamikaze-vs-kamikaze, now any enemy — see CollisionSystem._kamikazesVsEnemies).
  // otherScore is whichever per-type score `other` would normally be worth, so colliding with a
  // roamer still pays out differently than colliding with a bomber or another kamikaze. Score/wave-
  // stats-wise this still counts as two ordinary kills; only the explosion itself is scaled up.
  explodeKamikazeWith(k, other, otherScore){
    k.alive = false; other.alive = false;
    const midX = wrapX(k.x + wrapDelta(k.x,other.x)/2), midY = (k.y+other.y)/2;
    this.addScore(CONFIG.scoring.perKamikazeKilled + otherScore);
    this.spawnDebris(midX, midY, '#ff3b3b', CONFIG.kamikaze.collisionDebrisCount);
    this.sound.play('kamikazeCollision', { x: midX });
    this.waves.recordEnemyDestroyed(2);
    // a roamer caught mid-collision still drops whatever captive it was carrying, same as every
    // other way a roamer can die — bombers and kamikazes simply don't have this field
    if(other.carrying) this.spawnFallingCaptive(other.x, other.y);
  }

  nearestBuilding(x){
    let best=null,bd=1e9;
    for(const b of this.buildings){ const d=Math.abs(wrapDelta(x,b.x)); if(d<bd){bd=d;best=b;} }
    return {b:best,d:bd};
  }

  // The ship can land anywhere the player could walk — open ground, or a building rooftop if it's
  // actually up at roof height over that building's footprint (not just passing underneath it at
  // street level, which is equally "walkable" but a different surface). Picks whichever candidate
  // surface (ground, or any non-destroyed building whose footprint contains x) is vertically closest
  // to the ship, so approaching low glides in over the ground even under a tall building, while
  // approaching at rooftop height settles onto the roof.
  landingSurfaceAt(x, y){
    let best = { topY: GROUND_Y, roofRef: null, dist: Math.abs(y - (GROUND_Y - 8)) };
    for(const b of this.buildings){
      if(b.destroyed) continue;
      if(!b.containsX(x)) continue;
      const dist = Math.abs(y - (b.roofY - 8));
      if(dist < best.dist) best = { topY: b.roofY, roofRef: b, dist };
    }
    return best;
  }

  // ---- carried items -------------------------------------------------------

  // superbomb: destroys every enemy currently visible on screen — roamers, bombers, AND kamikazes,
  // per Mike's request that superbombs destroy all enemy types (previously only roamers). Buildings
  // are untouched. roamerCount is tracked separately because only roamers participate in the
  // wave-clear system — bombers and kamikazes are persistent, wave-independent threats, so a
  // superbombed one shouldn't (and structurally can't, there's no per-wave quota for either) count
  // toward "this wave is cleared." All three kinds still contribute to the score bonus.
  useSuperbomb(){
    let roamerCount = 0, bomberCount = 0, kamikazeCount = 0;
    for(const r of this.roamers){
      if(!r.alive) continue;
      const sx = relX(this.camera.x, r.x);
      if(sx > -20 && sx < W+20){
        r.alive = false;
        this.spawnDebris(r.x, r.y, '#c98bff', CONFIG.debris.enemyKillCount, r.vx, r.vy);
        if(r.carrying) this.spawnFallingCaptive(r.x, r.y);
        roamerCount++;
      }
    }
    for(const bo of this.bombers){
      if(!bo.alive) continue;
      const sx = relX(this.camera.x, bo.x);
      if(sx > -20 && sx < W+20){
        bo.alive = false;
        this.spawnDebris(bo.x, bo.y, '#ff8a4d', CONFIG.debris.enemyKillCount, bo.vx, bo.vy);
        bomberCount++;
      }
    }
    for(const k of this.kamikazes){
      if(!k.alive) continue;
      const sx = relX(this.camera.x, k.x);
      if(sx > -20 && sx < W+20){
        k.alive = false;
        this.spawnDebris(k.x, k.y, '#ff3b3b', CONFIG.debris.enemyKillCount, k.vx, k.vy);
        kamikazeCount++;
      }
    }
    this.roamers = this.roamers.filter(r=>r.alive);
    this.bombers = this.bombers.filter(bo=>bo.alive);
    this.kamikazes = this.kamikazes.filter(k=>k.alive);
    // superbomb kills remove roamers from the array immediately (unlike a bullet kill, which just
    // flags alive=false and lets the next Roamer.updateAll pass count/filter it) — so this has to
    // credit the wave-resolved count itself, or a superbombed wave could never register as cleared.
    // Bombers and kamikazes deliberately excluded — see above.
    this.waves.recordResolved(roamerCount);
    this.waves.recordEnemyDestroyed(roamerCount + bomberCount + kamikazeCount);
    if(roamerCount>0) this.addScore(roamerCount*CONFIG.scoring.perRoamerKilled);
    if(bomberCount>0) this.addScore(bomberCount*CONFIG.scoring.perBomberKilled);
    if(kamikazeCount>0) this.addScore(kamikazeCount*CONFIG.scoring.perKamikazeKilled);
    this.superbombFlash = CONFIG.pickup.flashDuration;
    // deliberately ONE boom for the whole sweep, not one per enemy caught: the superbomb is a single
    // event, and a dozen overlapping death cracks on top of it would just be mud
    this.sound.play('superbomb');
    this.pilot.superbombCount--;
  }

  // fire-suppressant: fully repairs whichever damaged building the player is on/nearest to — only
  // consumed if it actually finds a valid damaged target, so it's never wasted on a bad press
  useFireSuppressant(){
    const {b,d} = this.nearestBuilding(this.pilot.x);
    if(!b || b.destroyed || b.hp >= b.maxHp) return;
    const nearEnough = this.pilot.roofRef === b || d < b.width/2 + 20;
    if(!nearEnough) return;
    b.repair();
    this.spawnDebris(b.x, GROUND_Y - b.height/2, '#8fffb0', CONFIG.debris.fireSuppressantCount);
    this.sound.play('suppressant', { x: b.x });
    this.pilot.fireSuppressantCount--;
  }

  // ---- mode transitions ----------------------------------------------------

  enterInterior(building){
    this.mode = 'interior';
    this.interior.enter(building);
  }

  // Boarding and landing are both explicit, key-triggered actions (per Mike's request in round 19,
  // reverting rounds 16-18's fully-automatic versions) — press A for either, depending on current
  // mode. Called once per physical A press (see Input's e.repeat guard), so there's no passive
  // re-trigger risk from holding the key down through a takeoff/landing glide.
  tryBoardOrLand(){
    if(this.mode === 'foot'){
      // reachable from either the ground or a rooftop, wherever the ship happens to be parked. Must
      // be standing on the same surface the ship is parked on (both on the ground, or both on the
      // same rooftop) — otherwise a small x-distance could false-positive board a ship parked on a
      // rooftop from directly below it on the street, or vice versa.
      const shipDist = Math.abs(wrapDelta(this.pilot.x, this.ship.x));
      if(!this.ship.airborne && shipDist < CONFIG.ship.boardDist && this.pilot.roofRef === this.ship.parkedOn){
        this.mode = 'flight';
        this.sound.play('board');
        this.sound.play('takeoff');
        this.ship.board(this.pilot.x);
      }
    } else if(this.mode === 'flight' && this.ship.alive && this.ship.auto === null){
      // landing requires being close to a landable surface's resting height (CONFIG.ship.landDist)
      // AND moving slowly enough (CONFIG.ship.landSpeedFrac) at the moment A is pressed — open
      // ground always qualifies as landable, a rooftop only if it has a landing pad (see
      // CONFIG.buildings/hasLandingPad and Building._drawLandingPad). Pressing A while too fast, too
      // far away, or over a pad-less rooftop just does nothing — no feedback beyond staying in
      // flight, matching how a failed board attempt behaves too.
      const surf = this.landingSurfaceAt(this.ship.x, this.ship.y);
      const landable = !surf.roofRef || surf.roofRef.hasLandingPad;
      const slowEnough = this.ship.speed <= CONFIG.ship.maxSpeed * CONFIG.ship.landSpeedFrac;
      if(landable && surf.dist < CONFIG.ship.landDist && slowEnough){
        this.sound.play('landing');
        this.ship.beginLanding(surf);
      }
    }
  }

  // ---- death and respawn ---------------------------------------------------

  loseLife(){
    if(this.gameOver) return; // defensive — nothing left to lose, and don't want a stray post-death hit re-triggering the high-score save
    this.lives--;
    this.hud.setLives(this.lives);
    if(this.lives<=0){
      this.gameOver = true;
      this.gameOverDisplayTimer = CONFIG.respawn.gameOverDisplayDelay;
      // frozen here rather than read live off this.score at draw time: the world keeps simulating
      // after GAME OVER (an already-in-flight bullet can still kill a roamer, say), which can nudge
      // the score again after this exact value has already been saved to the board — reading it live
      // both showed a "final" score that kept changing and broke the high-score row match below
      // (Renderer.drawGameOver's lastIndexOf), since the live score no longer equalled anything on it.
      this.finalScore = this.score;
      this.finalHighScores = this.highScores.save(this.score);
      // the drums bleed away rather than stopping dead, and every loop goes with the run
      this.sound.play('gameOver');
      this.sound.stopMusic(CONFIG.audio.music.gameOverFade);
      this.sound.stopAllLoops();
      // per Mike's request: all audio stops until the game is restarted. The world keeps simulating
      // after GAME OVER (bombs still land, roamers still die), which otherwise kept triggering fresh
      // sounds and ambient loops right through the GAME OVER screen. Set after the sounds above, so
      // the stinger and the music's fade-out are still heard rather than cut off mid-note.
      this.sound.locked = true;
      if(this.mode==='flight'){ this._destroyShip(CONFIG.debris.shipFinalDeathCount); }
      else if(this.mode==='foot'){ this.spawnDebris(this.pilot.x, this.pilot.midY, '#ff8b5e', CONFIG.debris.footFinalDeathCount); this.pilot.hidden = true; }
      return;
    }
    this.sound.play('shipLost');
    // hide the destroyed ship/player and let the explosion play out — the next life doesn't actually
    // start (see finishRespawn) until the debris has finished and the "lives left" pause has elapsed
    if(this.mode==='flight'){
      this._destroyShip(CONFIG.debris.shipDeathCount);
    } else if(this.mode==='foot'){
      this.spawnDebris(this.pilot.x, this.pilot.midY, '#ff8b5e', CONFIG.debris.footDeathCount);
      this.pilot.hidden = true;
    }
    this.respawn = new RespawnSequence(this.mode);
  }

  // shared by the final death and the ordinary one so they can't drift apart: blow the ship up with
  // its own momentum behind the debris, then hand that exact cloud to the camera to follow while it
  // burns out (see Camera.trackDebris) — there's nothing else left to watch until the next life.
  _destroyShip(debrisCount){
    const cloudLife = this.spawnDebris(this.ship.x, this.ship.y, '#ffe08a', debrisCount, this.ship.vx, this.ship.vy);
    this.camera.followWreckage(this.ship.vx, cloudLife); // the wreck is the only thing left worth watching
    this.ship.alive = false;
  }

  finishRespawn(){
    if(this.respawn.mode === 'flight'){
      // wrapX(camera.x) is exactly the world x that relX maps to the screen's horizontal center, and
      // H/2 centers it vertically too. The camera has long since settled wherever the wreckage came
      // to rest (the drift finishes ~1.4s in, well before the respawn's 2.9s), so the new ship
      // arrives centred on the last thing the player was looking at.
      this.camera.cancelDrift();
      this.ship.respawnAirborne(wrapX(this.camera.x), H/2);
      this.camera.follow(this.ship.x);
    } else if(this.respawn.mode === 'foot'){
      this.pilot.hidden = false;
      this.pilot.invuln = CONFIG.pilot.invulnAfterRespawn;
    }
    this.respawn = null;
  }

  // ---- pause -----------------------------------------------------------

  // P, mid-game. update() is simply skipped while paused (see start()), which freezes every timer,
  // loop, and animation for free — nothing here needs its own pause-awareness. Audio is suspended
  // right along with it so a paused game is a silent one, rather than the engine hum and drone loops
  // droning on in real time while the world on screen sits frozen.
  togglePause(){
    this.paused = !this.paused;
    if(this.paused) this.sound.pause();
    else this.sound.resume();
  }

  // ---- tick ----------------------------------------------------------------

  update(dt){
    // the world doesn't pause just because the player did — roamers keep hunting/departing, bombs
    // keep falling, pickups keep spawning, right through the death explosion and "SHIP LOST"
    // overlay, AND right through the final death into GAME OVER too. Only the player's own input
    // handling is ever suspended (nothing to control — they're hidden/destroyed) until the next life
    // actually starts, or forever once the game is over.
    if(this.gameOver){ if(this.gameOverDisplayTimer > 0) this.gameOverDisplayTimer -= dt; }
    else if(this.respawn){ if(this.respawn.update(dt)) this.finishRespawn(); }
    else if(this.mode === 'foot') this.pilot.update(dt, this);
    else if(this.mode === 'interior') this.interior.update(dt, this);
    else if(this.mode === 'flight') this.ship.update(dt, this);

    this.roamers = Roamer.updateAll(this.roamers, dt, this);
    this.bombers = Bomber.updateAll(this.bombers, dt, this);
    this.kamikazes = Kamikaze.updateAll(this.kamikazes, dt, this);
    Humanoid.updateAll(this.humanoids, dt, this);
    this.waves.updateTransition(dt);
    this.bombs = Bomb.updateAll(this.bombs, dt, this);
    this.pickups.update(dt, this);
    if(this.superbombFlash > 0) this.superbombFlash -= dt;
    this.fallingCaptives = FallingCaptive.updateAll(this.fallingCaptives, dt, this);
    this.debris.update(dt);
    this.camera.update(dt); // after the debris moves, so a drifting camera reads this frame's positions
    this._updateAudioLoops();

    this.playerBullets = PlayerBullet.updateAll(this.playerBullets, this.camera);
    this.enemyBullets = EnemyBullet.updateAll(this.enemyBullets, this.camera);
    this.collisions.run();
    this.updateHud();
  }

  // The continuous sounds, re-evaluated every frame from game state rather than started and stopped
  // at event sites. Each of these is a thing that is either happening or not right now — the ship is
  // flying or it isn't, there are roamers on screen or there aren't — and driving them off the state
  // directly means they can never be left running by a path that forgot to stop them (a death, a
  // superbomb clearing the screen, a restart).
  _updateAudioLoops(){
    const flying = this.mode === 'flight' && this.ship.alive && !this.respawn;
    this.sound.loopWhile('engine', flying, {
      speedFrac: Math.min(1, Math.abs(this.ship.vx)/CONFIG.ship.maxSpeed),
      thrusting: this.ship.thrusting,
      gliding: this.ship.auto !== null,
    });
    // enemy drones follow how many are actually ON SCREEN, not how many exist — the drone is about
    // the pressure in front of you, and something two screens away shouldn't be adding to it
    this.sound.loopWhile('roamerDrone', true, { count: this._onScreenCount(this.roamers) });
    this.sound.loopWhile('bomberDrone', true, { count: this._onScreenCount(this.bombers) });
    this.sound.loopWhile('kamikazeDrone', true, { count: this._onScreenCount(this.kamikazes) });
  }

  _onScreenCount(list){
    let n = 0;
    for(const e of list){
      if(!e.alive) continue;
      const sx = relX(this.camera.x, e.x);
      if(sx > -40 && sx < W+40) n++;
    }
    return n;
  }

  updateHud(){
    const ship = this.ship, pilot = this.pilot;
    this.hud.setMode(
      this.mode==='flight' ? (ship.auto==='landing' ? 'LANDING…' : ship.auto==='takeoff' ? 'TAKING OFF…' : 'FLIGHT')
      : this.mode==='interior' ? 'INSIDE BUILDING'
      : pilot.climbing ? 'CLIMBING'
      : pilot.roofRef ? 'ON ROOFTOP'
      : 'ON FOOT'
    );
    const carried = [];
    if(pilot.superbombCount>0) carried.push('SUPERBOMB x'+pilot.superbombCount+' (S)');
    if(pilot.fireSuppressantCount>0) carried.push('FOAM x'+pilot.fireSuppressantCount+' (F)');
    this.hud.setItems(carried);
  }

  draw(){ this.renderer.draw(); }

  start(){
    let last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.033,(t-last)/1000); last=t;
      // run `simSpeed` logic ticks per rendered frame, so testing at 2x/4x/8x compresses real time
      // uniformly across dt-scaled physics AND frame-based bullet motion, rather than just scaling dt
      // (which would speed up movement but leave bullets — a fixed distance per tick — unchanged).
      // Paused, none of that runs at all — `last` still advances above so unpausing doesn't see a
      // giant dt for the frame spent sitting still.
      if(!this.paused) for(let i=0;i<this.input.simSpeed;i++) this.update(dt);
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
