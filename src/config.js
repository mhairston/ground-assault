// ==== CONFIG: every hard-coded gameplay number lives here, in one POJO, per Mike's request — edit a
// value here and it takes effect everywhere that number is used. Scope note: this covers everything
// that affects speed, timing, distance, size-that-matters-for-collision/targeting, count, or score.
// Purely decorative pixel offsets inside the per-style building rendering (window/door/antenna
// placement in Building.draw), HUD/radar layout pixels, colors, and font sizes are deliberately left
// as literals in their draw methods — they're art direction, not gameplay tuning, and pulling every
// single one out here would bloat this object without giving anyone a real reason to touch it. ====
export const CONFIG = {
  world: {
    canvasW: 960, canvasH: 540,   // also drives the actual <canvas> element size, see main.js
    width: 4800,                   // how far the world wraps around (was WORLD_W)
    groundY: 460,                   // y-coordinate of ground level (was GROUND_Y)
  },
  // edit/add/remove entries here to change how many buildings exist, and where — "number of
  // buildings" has no separate count field because the list itself IS the configuration.
  // hasLandingPad marks a building's roof as one the ship can actually land on, per Mike's request —
  // only one of the 8 ladder-having (non-house) buildings has one by default; every other rooftop,
  // ladder or not, is walkable/climbable as always but the ship itself can't set down there.
  buildings: [
    { x: 260,  width: 90,  height: 90,  style: 'block' },
    { x: 550,  width: 80,  height: 70,  style: 'house' },
    { x: 850,  width: 70,  height: 200, style: 'tower', hasLandingPad: true },
    { x: 1150, width: 75,  height: 65,  style: 'house' },
    { x: 1450, width: 170, height: 60,  style: 'warehouse' },
    { x: 2050, width: 110, height: 130, style: 'tenement' },
    { x: 2650, width: 130, height: 140, style: 'block' },
    { x: 3200, width: 80,  height: 240, style: 'tower' },
    { x: 3500, width: 85,  height: 75,  style: 'house' },
    { x: 3800, width: 130, height: 55,  style: 'warehouse' },
    { x: 4350, width: 95,  height: 100, style: 'tenement' },
    { x: 4600, width: 70,  height: 60,  style: 'house' },
  ],
  building: {
    maxHp: 10, // legacy flat default — superseded by the size-scaled formula below, kept only as the
               // reference point that formula scales from
    // smaller buildings have less HP than bigger ones, per Mike's request: HP scales with a
    // building's footprint area (width*height) relative to a reference building (the original 90x90
    // 'block', which kept its old flat 10 HP), clamped to a sensible min/max so a tiny house isn't a
    // one-shot kill and a huge tower isn't unkillable. See Building.hpFor().
    hpAreaReference: 8100, // 90*90 — the original block style's footprint
    hpMin: 4, hpMax: 18,
    holeRadius: 28,
    holeRadiusVarianceFrac: 0.35, // per-hit hole size varies ±35%, per Mike's request for more
                                  // visual variation in bomb damage — see Building.damage
    debrisOnHit: 6,
    debrisOnDestroy: 64,
    humanDeathRadiusPastEdge: 10,     // how far past a destroyed building's footprint a human still dies
    ramDamagesBuildingsDefault: false, // see RAM_DAMAGES_BUILDINGS
    ramTolXPastEdge: 12, ramTolYAboveRoof: 6, ramTolYBelowGround: 4,
  },
  shipPad: { x: 60 },
  ship: {
    w: 52, h: 24, // doubled (was 26/12), per Mike's request — Ship.draw's hull shape is expressed as
                  // fractions of these rather than fixed pixel literals, so it scales automatically.
                  // Deliberately visual-only: the ram/enemy-bullet hitbox tolerances below are
                  // unchanged, same judgment call as an earlier round's bullet-width-only sizing change
                  // (see the design brief) — flagging in case the intent was to also grow the hitbox.
    startYOffset: -8,          // relative to ground level
    acceleration: 800,
    drag: 0.9921,
    maxSpeed: 1890,
    minFlightAltAboveGround: 45, // flight floor = groundY - this
    flightCeilingY: 50,
    autoGlideSpeed: 260,
    bulletSpeed: 23.4,
    bulletOffsetX: 16,
    burstSize: 6,
    burstInterval: 0.1,
    burstCooldown: 0.5,
    ramRoamerTolX: 14, ramRoamerTolY: 12,
    ramBomberTolX: 16, ramBomberTolY: 14,
    enemyBulletTolX: 11, enemyBulletTolY: 9,
    landDist: 20, // per Mike's request (round 19): board/land are key-triggered again (press A), not
                  // automatic — but landing still requires being close to a landable surface's resting
                  // height (open ground, or a rooftop with a landing pad) AND moving slowly (see
                  // landSpeedFrac below). This is that distance tolerance — how close counts as "close
                  // enough" when A is pressed. (Was `landContactTol: 8`, a pure-touch tolerance, for one
                  // round — round 18 — when landing briefly had no key and no speed check at all; both
                  // are back now, per Mike's follow-up request, along with a wider tolerance since the
                  // player now has to actively line up the press rather than just touching down.)
    landSpeedFrac: 0.1, // fraction of maxSpeed that counts as "moving slowly enough" to land when A is
                        // pressed — 189px/s. Reused from the value validated in an earlier round's
                        // physics simulation (see design brief): loose enough to land comfortably, but
                        // safely below the speed reached by a couple hundred ms of ordinary thrust, so a
                        // player who's still accelerating away can't accidentally satisfy it.
    boardDist: 16,
    boardLiftHeight: 60, // on boarding, the ship visibly lifts this many px above wherever it boarded
                         // (clamped to flightCeilingY) before handing control to the player — purely a
                         // "you're airborne now" visual cue, not load-bearing for any anti-re-land logic
                         // (board/land are explicit A-key presses now, with OS key-repeat filtered out —
                         // see Input — so there's no passive-retrigger risk to guard against).
    invulnAfterRespawn: 1.5,
  },
  pilot: {
    w: 10, h: 20,
    speed: 154,
    startOffsetFromShip: 100,
    ladderClimbSpeedFactor: 0.7,
    ladderProximity: 8,
    doorProximity: 10,
    shootCooldown: 0.22,
    bulletSpeed: 11,
    rooftopClampMargin: 6,
    invulnAfterRespawn: 1.5,
    animSpeed: 15,
  },
  humanoid: {
    height: 20,
    count: 10,
    growthPerWave: 3,
    fleeSpeed: 35,
    fleeTriggerDist: 100,
    wanderSpeed: 30,
    climbSpeed: 40,
    doorReachDist: 4,
    animSpeed: 15,
    blinkDuration: 0.9,
    roofSettleMin: 2, roofSettleRandRange: 2,
    wanderTimerMin: 3, wanderTimerRandRange: 3,
  },
  roamer: {
    huntSpeed: 60,
    wanderSpeed: 50,
    escapeSpeed: 80,
    departClimbSpeed: 65,
    descendSpeed: 90,
    descendDriftAmp: 20,
    maxDiveSpeed: 60,
    diveGain: 3.5,
    transitY: 200,
    nearHorizontally: 80,
    captureOffset: 8,
    captureTolX: 5, captureTolY: 5,
    wobbleAmp: 15, wobbleThreshold: 3,
    separationDist: 18, separationY: 14, separationPush: 30,
    gunfireRange: 480, gunfireSpeed: 7,
    shootTimerMin: 1.6, shootTimerRandRange: 1.6,
    initialShootTimerMin: 1, initialShootTimerRandRange: 2.5,
    outOfRangeRecheck: 0.4,
    idleRecheck: 0.6,
    tiltMaxDeg: 10, tiltScale: 0.00105, // bumped from 5 to 10, per Mike's request
    tiltEaseRate: 8, // how fast the drawn tilt eases toward its target each second, per Mike's
                      // request that the tilt transition be animated rather than an instant snap —
                      // see Roamer.easeTilts and Roamer.draw
    respawnTimerBase: 5, respawnTimerRandRange: 4,
    initialRespawnTimer: 4,
    spawnDistMin: 250, spawnDistRandRange: 550,
    spawnYBase: -20, spawnYRandRange: 80,
    descendTargetYBase: 200, descendTargetYRandRange: 120,
    bulletTolX: 10, bulletTolY: 20,
    // each roamer gets its own preferred cruise/transit altitude, assigned once at spawn, per Mike's
    // request that roamers "seek unique altitudes so they don't appear to be shooting each other" —
    // previously every hunting roamer converged on the same fixed transitY while closing horizontally
    // on a target, which visually lined multiple roamers up on the same row mid-gunfight. Used in
    // place of the old shared TRANSIT_Y, and as the home altitude idle/patrolling roamers drift
    // toward. See Roamer.spawn and Roamer.update.
    preferredAltMin: 120, preferredAltRandRange: 160,
    altHomePull: 0.8, // how strongly idle/patrolling roamers ease back toward their preferred altitude
  },
  wave: {
    baseQuota: 10,
    quotaPerWave: 5,
    quotaCap: 45,
    releaseRateCap: 3,
    releaseRateDivisor: 3,
    completeBonus: 500,
    completeOverlayDuration: 3.0,
  },
  bomber: {
    speed: 90, zigzagAmp: 45, zigzagFreq: 1.8,
    maxAlive: 2,
    initialRespawnTimer: 6,
    respawnTimerBase: 8, respawnTimerRandRange: 6,
    bombTimerMin: 1.5, bombTimerRandRange: 2,
    reloadTimerBase: 3, reloadTimerRandRange: 3,
    despawnDist: 900,
    baseYMin: 110, baseYRandRange: 70,
    spawnDistMin: 500, spawnDistRandRange: 300,
    ramTolX: 16, ramTolY: 14,
    bulletTolX: 12, bulletTolY: 20,
  },
  bomb: {
    fallSpeed: 130,
    blastXTol: 26, blastYTol: 30,
    // direct bomb-body collision box (a bomb falling straight into the ship or the on-foot pilot,
    // as opposed to the blast tolerances above). Explicit tolerances rather than something derived
    // from ship.w/h: the ship's 52x24 size is deliberately visual-only (see the note on ship.w), so
    // deriving from it would give the bomb a 62x34 hitbox against a hull whose every other hitbox
    // is 9-16px. Ship values match ramBomberTolX/Y — same bomber ordnance, same scale as the rest
    // of the ship's hitboxes. Pilot values match the pilot's true 10x20 drawn size plus the bomb's
    // 5px radius, which is where they already sat.
    directHitShipTolX: 16, directHitShipTolY: 14,
    directHitPilotTolX: 10, directHitPilotTolY: 15,
    humanBlastRadius: 50, // circular blast radius for killing nearby humans, per Mike's request — see
                          // the humanoid-kill check in Bomb.explode, which measures true radial
                          // distance instead of a separate x/y tolerance box
    holeJitterX: 70, holeJitterY: 54, // widened (was 36/28), per Mike's request for more variation in
                                       // where bomb damage lands on a building's face
    maxGroundScorches: 150,
    debrisOnExplode: 10,
  },
  captive: {
    fallSpeed: 70,
    catchTolX: 18, catchTolY: 18,
    surviveStoryHeight: 25, surviveStories: 2,
    rooftopDropTol: 40,
    roofSettleMin: 2, roofSettleRandRange: 2,
    debrisOnLost: 6,
    scoreOnRescue: 50,
    blinkDuration: 0.9,
  },
  bullet: {
    trailLength: 26,
    widthHoriz: 24,   // longer horizontally, per Mike's request (was 6)
    heightVert: 16,
    heightHoriz: 4,
    cullMargin: 200,
    maxRange: 600, // player bullets fizzle out after traveling this far, per Mike's request — see
                    // PlayerBullet, which tracks accumulated distance per bullet.
    enemyMaxRange: 900, // roamer gunfire fizzles out after traveling this far, per Mike's request —
                        // same accumulated-distance approach as player bullets, just a separate, longer
                        // range and a separate CONFIG field since the two aren't meant to always match.
  },
  pickup: {
    maxCarry: 3,
    maxOnMap: 3,
    initialSpawnTimerBase: 8, initialSpawnTimerRandRange: 8,
    respawnTimerBase: 10, respawnTimerRandRange: 12,
    collectDist: 10,
    flashDuration: 0.35,
    hoverHeight: 16, // how far above the rooftop surface a pickup floats — raised from 7, per Mike's
                      // request for more visual separation between the rooftop and the item sitting on it
  },
  scoring: {
    perEnemyKilled: 25,
    perBombShotDown: 15,
    perCaptiveRescued: 50,
    perHumanLost: -50,
    perBuildingDestroyed: -100,
    perWaveCleared: 500,
  },
  debris: {
    enemyKillCount: 16,
    buildingHitCount: 6,
    buildingDestroyCount: 64,
    shipDeathCount: 14,
    shipFinalDeathCount: 16,
    footDeathCount: 14,
    footFinalDeathCount: 16,
    bombExplodeCount: 10,
    fireSuppressantCount: 10,
  },
  respawn: {
    debrisStageDuration: 0.9,
    showLivesDuration: 2.0,
  },
  highScores: { key: 'groundAssaultHighScores', maxEntries: 10 },
  player: { startingLives: 3 },
};

// ---- derived world constants: read straight off CONFIG.world so there's exactly one source of truth
// for the world's dimensions, and every module can import them without re-deriving anything. ----
export const W = CONFIG.world.canvasW;
export const H = CONFIG.world.canvasH;
export const GROUND_Y = CONFIG.world.groundY;
export const WORLD_W = CONFIG.world.width;

// the lowest altitude the ship can hold while actually flying (see Ship.update's clamp) — shared
// with FallingCaptive so the "ship drops off a carried human at its lowest point" check uses the
// exact same floor, instead of an independent magic number that can silently drift out of sync.
export const MIN_FLIGHT_ALT_Y = GROUND_Y - CONFIG.ship.minFlightAltAboveGround;

// Building styles: each has a base body color (lerped toward red as it takes damage — same for all
// styles) plus its own window/accent color and rendering treatment (see Building.draw).
export const BUILDING_STYLES = {
  block:     { base:[35,54,80],  window:[74,106,143], accent:[92,127,168] },
  tower:     { base:[45,42,70],  window:[150,120,210], accent:[180,150,230] },
  warehouse: { base:[58,56,48],  window:[150,138,88],  accent:[184,160,90] },
  tenement:  { base:[46,58,52],  window:[118,148,110], accent:[150,178,130] },
  house:     { base:[70,48,38],  window:[210,190,130], accent:[150,90,60] },
};

// config: whether flying the ship into a building costs a life and damages it (the logic is kept
// intact in CollisionSystem, just gated behind this flag). Defaults to false per Mike's request — by
// default the ship simply flies in front of/through buildings unharmed, no collision at all. Flip to
// true to restore the old ramming-has-consequences behavior.
export const RAM_DAMAGES_BUILDINGS = CONFIG.building.ramDamagesBuildingsDefault;

// config: whether walking through a building's door drops the player into the little interior demo
// room. Disabled per Mike's request ("disable the building-interior function for now") — the
// Interior class and the door-proximity check in Pilot are left completely intact, just gated behind
// this flag, so re-enabling it later is a one-line flip.
export const INTERIOR_ENABLED = false;
