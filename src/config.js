// ==== CONFIG: every hard-coded gameplay number lives here, in one POJO, per Mike's request — edit a
// value here and it takes effect everywhere that number is used. Scope note: this covers everything
// that affects speed, timing, distance, size-that-matters-for-collision/targeting, count, or score.
// Purely decorative pixel offsets inside the per-style building rendering (window/door/antenna
// placement in Building.draw), HUD/radar layout pixels, colors, and font sizes are deliberately left
// as literals in their draw methods — they're art direction, not gameplay tuning, and pulling every
// single one out here would bloat this object without giving anyone a real reason to touch it. ====
export const CONFIG = {
  world: {
    // canvasW is the width actually in use, not a fixed setting: the view fills the browser window
    // up to maxCanvasW, per Mike's request, so this starts as a sensible default and is overwritten
    // by setViewportWidth() on load and on every resize. A wider window simply shows more of the
    // world at once — the world itself (`width` below) doesn't change, and neither does the radar's
    // scale; the radar's viewport box just grows to match how much is visible. See main.js.
    canvasW: 960, canvasH: 540,
    maxCanvasW: 1800,              // never grow past this however wide the window gets
    minCanvasW: 480,               // ...or shrink below it, past which the HUD stops being readable
    canvasMarginX: 32,             // window space the canvas can't have: #wrap's 14px padding plus
                                   // the canvas's own 2px border, both sides (see index.html CSS)
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
    acceleration: 700,          // horizontal (Left/Right) thrust
    // Vertical (Up/Down) is a flat rate, not a thrust, per Mike's request: hold the key and the ship
    // moves at exactly this many px/s, release it and it stops. drag and maxSpeed do not apply —
    // this IS the vertical speed, unlike `acceleration`, where the real cruise figure is the
    // acc*dt*drag/(1-drag) equilibrium rather than the number written here.
    verticalSpeed: 300,
    // How sharply the ship eases onto that speed while a key is held, per second — the smoothing that
    // keeps the start and the reversal from snapping, per Mike's request. It is NOT acceleration: the
    // ship still tops out at exactly verticalSpeed, this only shapes the moment it gets there. Higher
    // is crisper and more abrupt, lower is floatier and slower to answer the key. 10 reaches full
    // rate in about a fifth of a second.
    verticalEaseRate: 10,
    // The same idea for letting go, but its own much lazier number, per Mike's request that the ship
    // carry some vertical momentum: released, it keeps going and bleeds off rather than pulling up
    // short. The glide is verticalSpeed/verticalCoastRate px — 75 at these values, about a fifth of
    // the ship's altitude band — so lower this for a longer, floatier drift and raise it toward
    // verticalEaseRate to go back to stopping almost as soon as the key comes up.
    verticalCoastRate: 4,
    drag: 0.9941,
    maxSpeed: 600,
    minFlightAltAboveGround: 45, // flight floor = groundY - this
    flightCeilingY: 50,
    autoGlideSpeed: 260,
    flameAnimSpeed: 14, // how fast the exhaust plume flickers while thrusting — see Ship._drawFlame
    bulletSpeed: 32,
    bulletOffsetX: 16,
    burstSize: 8,
    burstInterval: 0.06,
    burstCooldown: 0.4,
    ramRoamerTolX: 18, ramRoamerTolY: 16, // 30% up with the roamer sprite (was 14/12)
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
    ladderProximity: 6,
    doorProximity: 10,
    shootCooldown: 0.4,
    bulletSpeed: 12,
    rooftopClampMargin: 6,
    invulnAfterRespawn: 1.5,
    animSpeed: 15,      // running cycle
    climbAnimSpeed: 11, // hand-over-hand ladder cycle — slower than the run, in proportion to
                        // ladderClimbSpeedFactor, so the pilot doesn't scrabble up faster than they move
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
    wanderTimerMin: 3, wanderTimerRandRange: 3,
    // NB: the blink-on-rescue duration and the rooftop settle timer live on `captive` — they only
    // ever apply to a humanoid that has just been dropped or rescued, and that code reads them from
    // there. Duplicates of them sat here unread for a while; don't re-add them.
  },
  roamer: {
    // 30% larger than the original 20x13 triangle, per Mike's request. Roamer.draw expresses its
    // shape as fractions of these (the same treatment Ship.draw got), so resizing is a CONFIG edit
    // rather than a redraw — and unlike the ship's earlier size bump, the hitboxes below WERE scaled
    // to match, since the request was explicitly for the hit box to follow the sprite.
    w: 26, h: 17,
    huntSpeed: 80,
    wanderSpeed: 70,
    escapeSpeed: 80,
    departClimbSpeed: 65,
    descendSpeed: 90,
    descendDriftAmp: 20,
    maxDiveSpeed: 60,
    diveGain: 3.5,
    nearHorizontally: 80,
    captureOffset: 8,
    captureTolX: 5, captureTolY: 8,
    wobbleAmp: 15, wobbleThreshold: 3,
    // scaled with the sprite too: at the old 18/14 spacing, 30%-larger roamers visibly overlap each
    // other, which is the same "they look wrong next to each other" problem separation exists to fix
    separationDist: 23, separationY: 18, separationPush: 30,
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
    // Spawn and despawn distances are measured from the EDGE of the visible area, not from the
    // camera, because the viewport is no longer a fixed 960px (see world.maxCanvasW). As absolute
    // distances — they were spawn 500-800, despawn 900 — a wide window put both inside the view:
    // bombers appeared out of nowhere in plain sight and vanished at the screen edge, which is what
    // Mike saw as "bombers are disappearing". Written as margins they hold at any width. Keep
    // despawnMargin comfortably above spawnMarginMin+spawnMarginRandRange, or a bomber can spawn
    // already past its own despawn threshold and blink out on its first frame.
    despawnMargin: 420,
    // spawnMarginMin has to clear the bomber's own draw margin (24px in Bomber.draw), or a bomber
    // spawned at the minimum is already partly drawn at the screen edge — it pops into being in view
    // rather than flying in from outside it
    spawnMarginMin: 40, spawnMarginRandRange: 300,
    baseYMin: 110, baseYRandRange: 70,
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
    perHumanLost: -50,
    perBuildingDestroyed: -100,
    // NB: not every score lives here. A rescue pays captive.scoreOnRescue and clearing a wave pays
    // wave.completeBonus, both read from their own sections. Dead copies of the two sat here for a
    // while looking authoritative; don't re-add them.
  },
  debris: {
    // debris thrown off a destroyed ship/enemy flies away with the momentum that thing had, rather
    // than bursting from a standstill, per Mike's request — a roamer shot down mid-strafe scatters
    // along its flight path. momentumInherit is the share of the source's velocity each fragment
    // starts with; momentumSpread is the ± per-fragment variation on that share, so the cloud shears
    // apart instead of drifting as one rigid block. Only the sources that actually have a velocity
    // pass one (ship, roamers, bombers) — building hits, bomb blasts and ground impacts still burst
    // from rest, which is what they physically do.
    momentumInherit: 0.7, momentumSpread: 0.25,
    // air drag: the fraction of its velocity a fragment retains per second, applied to the burst and
    // the inherited momentum alike, so debris slows gradually instead of coasting flat-out for its
    // whole life. Applied as pow(drag, dt) so the decay is identical at any frame rate or sim speed.
    // Also caps the fall: terminal velocity is gravity/-ln(drag), ≈183px/s at these values.
    drag: 0.3,
    gravity: 220, // downward pull on a fragment, px/s² (was a literal in DebrisField.update)
    lifeMin: 0.5, lifeRandRange: 0.4, // how long a fragment burns for (was a literal in Fragment)
    // per-explosion fragment counts. NB: only these ones are read from here — a building hit or
    // collapse uses building.debrisOnHit/debrisOnDestroy and a bomb uses bomb.debrisOnExplode,
    // each read from its own section. Dead copies of those three sat here and had already drifted
    // out of step with the live values, so don't re-add them.
    enemyKillCount: 16,
    shipDeathCount: 28,
    shipFinalDeathCount: 16,
    footDeathCount: 14,
    footFinalDeathCount: 16,
    fireSuppressantCount: 5,
  },
  respawn: {
    debrisStageDuration: 0.9,
    showLivesDuration: 2.0,
  },
  camera: {
    // after the ship is destroyed the camera rides its debris cloud rather than freezing where the
    // ship was, per Mike's request — see Camera.update
    // The drift needs no follow/ease gains: it reproduces the debris' own motion (see Camera.update)
    // rather than steering toward it, so the only thing left to tune is how long the stop takes.
    driftStopTime: 0.5,  // how long it takes to slow to a full stop once the last fragment burns out
  },
  // ---- audio (see plans/sound-effects-plan.md and src/audio/) ------------------------------------
  // Everything is synthesised at runtime through the Web Audio API — no sample files, so the game
  // stays self-contained and adds no load time. These are the mix and behaviour knobs; the actual
  // voice recipes (which oscillator, which filter, what envelope) live in src/audio/voices.js, on
  // the same "art direction stays with the drawing" principle the CONFIG header sets out for colors.
  audio: {
    masterVolume: 0.85,
    // sub-buses, so the mix can be balanced by category rather than sound by sound. Ambient loops
    // (engine hum, enemy drones) sit far lower than one-shots on purpose — in isolation they sound
    // too quiet, and in the mix they are still the first thing to muddy everything else.
    sfxVolume: 0.95, ambientVolume: 0.3, musicVolume: 0.35, uiVolume: 0.75,
    startMuted: false,
    // Panning is screen-relative rather than world-relative (the plan's open question): an object at
    // the edge of the viewport is panned fully to that side, which is far more dramatic than scaling
    // pan across the whole 4800px world, where everything audible would sit near centre.
    panStrength: 0.85,   // 1 = hard left/right at the screen edges; less keeps some centre presence
    audibleMargin: 320,  // px beyond the screen edge a sound can still be heard at all
    edgeVolume: 0.15,    // how loud a sound is at that outer limit — it fades to this, never cuts off
    maxVoicesPerSound: 4, // concurrency cap per sound id, so a burst of them can't stack into clipping
    engine: {
      baseHz: 42, speedHz: 5,  // hum pitch = baseHz + speedHz * (speed/maxSpeed)
      volume: 0.15,              // relative to the ambient bus
      thrustNoiseVolume: 0.2,  // the noise puff layered under the hum while thrust keys are held
      glideVolume: 0.2,         // hum drops to this during an auto takeoff/landing glide
    },
    roamerDrone: { baseHz: 128, volume: 0.31, perRoamer: 0.05, lfoHz: 1.0, lfoPerRoamer: 0.18 },
    bomberDrone: { baseHz: 64, volume: 0.23, perBomber: 0.05, wobbleHz: 1.8, wobbleCents: 22 },
    bombWhistle: { fromHz: 1250, toHz: 400, volume: 0.1 },
    // rate limits for sounds that would otherwise fire many times a second
    footstepGap: 0.26, climbTickGap: 0.22, civilianYelpGap: 1.0,
    music: {
      enabled: true,
      bpm: 120,
      // tempo climbs with the waves, per the plan. Each entry is [fromWave, bpm], applied in order.
      tempoSteps: [[5, 140], [8, 160]],
      // 16 sixteenth-note steps, exactly the pattern drawn in the plan. Edit these strings to change
      // the beat — 'X' is a hit, anything else is a rest, and all four voices share the same grid.
      kick:     'X....X..X.X.....',
      snare:    '...X....X....X..',
      hatClosed:'XXX.X.XXXX.XX.XX',
      hatOpen:  '.....X....X.....',
      kickVolume: 0.9, snareVolume: 0.7, hatClosedVolume: 0.22, hatOpenVolume: 0.18,
      // the standard Web Audio clock: schedule this far ahead, waking this often, so the beat stays
      // tight even when the JS event loop is busy with a frame
      lookahead: 0.1, tickInterval: 0.025,
      fanfareDuckSeconds: 1.2, // drums cut for the wave-complete fanfare, then come back
      gameOverFade: 1.5,
    },
  },
  highScores: { key: 'groundAssaultHighScores', maxEntries: 10 },
  player: { startingLives: 3 },
};

// ---- derived world constants: read straight off CONFIG.world so there's exactly one source of truth
// for the world's dimensions, and every module can import them without re-deriving anything. ----

// The viewport width — how much of the world is on screen at once. `let`, not `const`, because it
// follows the browser window now (per Mike's request): main.js calls setViewportWidth on load and on
// every resize. Modules import it as an ES live binding, so they all see the new value with no
// plumbing, PROVIDED they read W where they use it. Caching it into a module-level derived constant
// (`const half = W/2`) would freeze it at load and silently stop tracking — the one thing to avoid.
export let W = CONFIG.world.canvasW;

// Clamps `px` into the allowed range, then publishes it as both CONFIG.world.canvasW and W.
// Returns the width actually used, which is what the canvas element should be sized to.
export function setViewportWidth(px){
  const w = Math.round(Math.max(CONFIG.world.minCanvasW, Math.min(CONFIG.world.maxCanvasW, px)));
  CONFIG.world.canvasW = w;
  W = w;
  return w;
}

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
