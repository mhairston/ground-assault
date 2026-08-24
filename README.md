# Ground Assault — v2 (modular)

A Defender-style arcade game: fly a ship over a wrapping city, shoot the aliens abducting its
civilians, and try not to level the place yourself. Vanilla ES modules, no build step, no
dependencies.

It began as `older/game-v2-ground-assault_X.html`, one 2,162-line inline `<script>`, decomposed into
ES-module classes with no gameplay, tuning, or art changes at the time of the split — every original
design comment moved with the code it explains. Features added since (kamikazes, synthesized audio,
the title screen) arrived in the modular layout. Every gameplay number still comes from
`src/config.js`.

## Running it

ES modules are blocked over `file://`, so opening `index.html` by double-clicking it will not work.
Serve the folder instead:

```sh
cd ground-assault
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Layout

```
index.html            markup + CSS + <script type="module" src="src/main.js">
src/
  main.js             sizes the canvas from CONFIG, builds a Game, starts the loop
  config.js           CONFIG (every gameplay number), BUILDING_STYLES, derived world constants, feature flags
  Game.js             the world: entity lists, shared state, tick order, mode transitions, score/life choke points
  core/
    geometry.js       wrapX / wrapDelta / relX — the world is a cylinder, so all x math goes through these
    Camera.js         camera x, the never-wrapping continuousX the parallax backdrop reads, death-drift
    Input.js          key state, sim-speed control, one-shot A (board/land), P (start/pause/restart), M (mute), 0 (debug)
    Hud.js            the DOM strip: score, wave, enemy count, ships, mode label, carried items, sound state
    HighScores.js     localStorage top-10
  entities/
    Building.js       hp/holes/damage/collapse + all five style treatments, ladder, landing pad
    Humanoid.js       civilians: flee, shelter, rooftop wander, ladder descent, blink-on-rescue
    Pilot.js          on-foot player: ground/rooftop/ladder movement, shooting, item use
    Ship.js           flight physics, altitude clamp, burst fire, takeoff/landing glides
    Roamer.js         hunting aliens: descend, transit, dive, capture, depart, tilt, separation
    Bomber.js         zig-zag bombing runs
    Kamikaze.js       wave-independent rammers: idle/patrol until the player is in range, then commit
    Bomb.js           constant-rate fall, impact damage, blast radius
    Bullet.js         PlayerBullet (comet trail, trail-hit vs head-hit) and EnemyBullet
    FallingCaptive.js dropped captives: fall, ship catch, rooftop/ground drop-off, survivable falls
    FallingCivilian.js visual-only fallers thrown out of a collapsing building — they tumble, curse, splat
    Pickup.js         Pickup + PickupField (spawn timer, rooftop collection, carry caps)
    Debris.js         DebrisField particle bursts
    GroundScorch.js   ScorchField — capped, permanent ground marks
    Interior.js       the demo room (still gated off behind INTERIOR_ENABLED)
  systems/
    WaveManager.js    quotas, trickle release, resolved counting, WAVE COMPLETE, between-wave lull
    CollisionSystem.js every hit resolution in one pass, in the original order
    RespawnSequence.js the two-stage debris -> "SHIP LOST" -> next life timer
  render/
    Renderer.js       draw order + full-screen overlays (title, paused, ship lost, wave complete, game over)
    Backdrop.js       sky, stars, two parallax mountain ranges
    Radar.js          the minimap strip
  audio/
    SoundManager.js   the one audio interface: play / startLoop / stopLoop, panning, voice caps, rate limits
    voices.js         ONE_SHOTS and LOOPS — the actual synthesis recipes for every sound
    DrumMachine.js    the 16-step background beat, on a Web Audio lookahead scheduler
```

## How the pieces talk

`Game` is the only shared handle. Entities get it as an argument (`update(dt, game)`) rather than
holding module-level references, so nothing depends on load order and a second `Game` could be
constructed without cross-talk. Anything with consequences on more than one entity — `addScore`,
`loseHumanoid`, `killRoamer`, `killBomber`, `killKamikaze`, `loseLife`, `landingSurfaceAt`,
`useSuperbomb`, `shipCrashIntoBuilding` — lives on `Game` as a single choke point, exactly as the
original kept those as single functions.

List-level passes that the original did over a whole array (culling, filtering, or logic that has to
see every member at once, like the roamers' mutual separation or the "only one captive rides at a
time" flag) are `static updateAll(list, …)` on the class and return the surviving list.

Audio is a one-way dependency: game code calls `game.sound.play(id, { x })` with a *world* x and
never touches the camera, the AudioContext, or a node. `SoundManager` is a total no-op when Web
Audio is unavailable, so audio can never break the game. Continuous loops (engine, enemy drones) are
re-evaluated every frame from game state in `Game._updateAudioLoops` rather than started and stopped
at event sites, so no code path can leave one stuck on.

## Behavior notes

- `Game.reset()` serves as both first-time setup and the P-to-restart path; the original had those as
  separate code that had to be kept in sync by hand.
- Draw order is preserved exactly, including the original's quirk that the GAME OVER screen is drawn
  before the WAVE COMPLETE panel.
- `P` is the one key for every top-level state transition: start from the title screen, pause and
  unpause, and restart after GAME OVER. Switching tabs auto-pauses but deliberately does not
  auto-resume.
- Sim speed (`1`/`2`/`4`/`8`) runs whole extra logic ticks per frame rather than scaling `dt`, so
  frame-based bullet motion speeds up along with everything else.
- Flying into a building destroys both, in the game's biggest explosion, at normal speed. Timing is
  made deterministic by giving the crash fireball an explicit lifetime — it is the longest-lived
  element by construction, so "the animation" is `shipCrashAnimDuration` long whatever was hit, and
  SHIP LOST / GAME OVER is held until two seconds after that.
- Everything one impact throws inherits a share of the impactor's velocity, via one pair of constants
  (`debris.momentumInherit`/`momentumSpread`): the fireball, the building's rubble, and its occupants
  alike, so a crash reads as one event rather than a fireball flung one way and rubble dropping
  straight down beside it. `Building.collapse(game, srcVx, srcVy)` carries it; collapses that really
  do happen from rest (a building shelled down by bombs) pass nothing and keep bursting from rest.
  Fallers take the horizontal share with the same air drag the fragments use, but only the *downward*
  part of the vertical — a person launched skyward out of the wreckage reads as a bug, not momentum.
- A building has 4-12 occupants depending on its footprint area (`Building.occupantsFor`, same basis
  as `hpFor`); they spill out whenever it collapses, not only in a ship crash. Each one tumbles as it
  falls and yelps the same cry a civilian gives when a roamer grabs them, but only a couple of the
  crowd carry a caption — captioning all twelve buried the explosion behind a wall of text. The yelps
  are individually delayed by a random offset (`CONFIG.fallingCivilian.yelpDelayRandRange`), which is
  what keeps a collapse from firing one chord of twelve, and also what keeps them under the voice cap
  so each is actually heard.
- `?wave=N` on the URL starts at that wave, civilian growth included, for testing the late game.
