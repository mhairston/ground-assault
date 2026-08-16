# Ground Assault — v2 (modular)

The same game as `game-v2-ground-assault_X.html`, decomposed from one 2,162-line inline `<script>`
into ES-module classes. No gameplay, tuning, or art changes — every number still comes from
`src/config.js`, and every original design comment moved with the code it explains.

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
    Camera.js         camera x plus the never-wrapping continuousX the parallax backdrop reads
    Input.js          key state, sim-speed control, one-shot A (board/land) and P (restart) callbacks
    Hud.js            the DOM strip: score, ships, mode label, carried items
    HighScores.js     localStorage top-10
  entities/
    Building.js       hp/holes/damage/collapse + all five style treatments, ladder, landing pad
    Humanoid.js       civilians: flee, shelter, rooftop wander, ladder descent, blink-on-rescue
    Pilot.js          on-foot player: ground/rooftop/ladder movement, shooting, item use
    Ship.js           flight physics, altitude clamp, burst fire, takeoff/landing glides
    Roamer.js         hunting aliens: descend, transit, dive, capture, depart, tilt, separation
    Bomber.js         zig-zag bombing runs
    Bomb.js           constant-rate fall, impact damage, blast radius
    Bullet.js         PlayerBullet (comet trail, trail-hit vs head-hit) and EnemyBullet
    FallingCaptive.js dropped captives: fall, ship catch, rooftop/ground drop-off, survivable falls
    Pickup.js         Pickup + PickupField (spawn timer, rooftop collection, carry caps)
    Debris.js         DebrisField particle bursts
    GroundScorch.js   ScorchField — capped, permanent ground marks
    Interior.js       the demo room (still gated off behind INTERIOR_ENABLED)
  systems/
    WaveManager.js    quotas, trickle release, resolved counting, WAVE COMPLETE, between-wave lull
    CollisionSystem.js every hit resolution in one pass, in the original order
    RespawnSequence.js the two-stage debris → "SHIP LOST" → next life timer
  render/
    Renderer.js       draw order + full-screen overlays (ship lost, wave complete, game over)
    Backdrop.js       sky, stars, two parallax mountain ranges
    Radar.js          the minimap strip
```

## How the pieces talk

`Game` is the only shared handle. Entities get it as an argument (`update(dt, game)`) rather than
holding module-level references, so nothing depends on load order and a second `Game` could be
constructed without cross-talk. Anything with consequences on more than one entity — `addScore`,
`loseHumanoid`, `killRoamer`, `killBomber`, `loseLife`, `landingSurfaceAt`, `useSuperbomb` — lives on
`Game` as a single choke point, exactly as the original kept those as single functions.

List-level passes that the original did over a whole array (culling, filtering, or logic that has to
see every member at once, like the roamers' mutual separation or the "only one captive rides at a
time" flag) are `static updateAll(list, …)` on the class and return the surviving list.

## Behavior notes

- `Game.reset()` serves as both first-time setup and the P-to-restart path; the original had those as
  separate code that had to be kept in sync by hand.
- Draw order is preserved exactly, including the original's quirk that the GAME OVER screen is drawn
  before the WAVE COMPLETE panel.
- The GAME OVER screen still reads "refresh to retry", verbatim from the original — it predates the
  P-to-restart key and is arguably stale copy, left alone here rather than silently reworded.
