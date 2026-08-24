import { CONFIG, GROUND_Y, W } from '../config.js';
import { relX } from '../core/geometry.js';

const CURSES = ['#!@%', '&*!!', '@$#*', '!#?$'];

// Visual-only fallers spawned when a building collapses: they tumble out, curse, and splat. There
// are 4-12 of them depending on the building's size (see Building.occupantsFor), so everything here
// is written for a crowd rather than for one of them at a time — only a couple carry a caption, and
// their yelps are scattered through time instead of landing together.
export class FallingCivilian {
  // curseIndex: null for the silent majority, or any integer for one of the captioned couple — it
  // picks the caption text by modulo, so callers hand out consecutive integers (from a random start)
  // to guarantee the visible captions differ from each other without having to know this list.
  // srcVx/srcVy: the velocity of whatever brought the building down (see Building.collapse). Each
  // faller leaves carrying a share of it on top of their own toss, per Mike's request, so the people
  // are thrown the same way as the rubble and the fireball instead of dropping vertically out of an
  // impact that flung everything else sideways.
  constructor(x, y, { curseIndex = null, srcVx = 0, srcVy = 0 } = {}){
    const cfg = CONFIG.fallingCivilian;
    this.x = x;
    this.y = y;
    // the same share-with-per-item-variation the debris fragments use (see Debris.js), so a crowd
    // shears apart on the way out rather than travelling as one rigid block, and so there is exactly
    // one notion in the game of how much of a source's motion carries into what it throws
    const share = CONFIG.debris.momentumInherit * (1 + (Math.random()*2-1)*CONFIG.debris.momentumSpread);
    this.vx = (Math.random() - 0.5) * 28 + srcVx*share;
    // Downward only. A fragment blown off an explosion can go any direction, but a person is falling,
    // and the most an impact can do to that is drive them down harder — inheriting an upward-climbing
    // ship's velocity launched them hundreds of pixels skyward out of the wreckage, which reads as a
    // bug rather than as momentum, and stretched the fall well past building.shipCrashAnimDuration.
    this.vy = 35 + Math.random()*45 + Math.max(0, srcVy)*share;
    this.dead = false;
    // null for most of them, per Mike's request — see CONFIG.fallingCivilian.curseCount for why
    this.curse = curseIndex === null ? null : CURSES[curseIndex % CURSES.length];
    this.curseT = 1.6 + Math.random()*0.8;
    // tumbling, per Mike's request. Starting angle is random too, so a crowd thrown clear at the
    // same instant isn't briefly a row of upright figures all beginning to rotate in unison.
    this.angle = Math.random()*Math.PI*2;
    this.spin = (cfg.spinMin + Math.random()*cfg.spinRandRange) * (Math.random() < 0.5 ? -1 : 1);
    // counts down to this faller's own yelp — the random spread is the whole point, so twelve
    // people falling out of a building sound like twelve people rather than one chord
    this.yelpT = cfg.yelpDelayMin + Math.random()*cfg.yelpDelayRandRange;
  }

  static updateAll(list, dt, game){
    for(const c of list) c.update(dt, game);
    return list.filter(c => !c.dead);
  }

  // the same cry a civilian gives when a roamer grabs them, per Mike's request — one voice, shared
  // with `capture` (see src/audio/voices.js). Fires once and then never again, whichever of the two
  // callers below gets there first.
  _yelp(game){
    if(this.yelpT === null) return;
    this.yelpT = null;
    game.sound.play('civilianYelp', { x: this.x });
  }

  update(dt, game){
    this.x += this.vx*dt;
    this.y += this.vy*dt;
    this.vy += CONFIG.captive.fallGravity*dt;
    // Horizontal air drag, the same pow(drag, dt) law the debris fragments use, so an inherited
    // sideways throw bleeds off at exactly the rate the wreckage around it does. Without this the
    // fallers would keep whatever the ship gave them forever and sail off across the world while the
    // rubble they came out with slowed to a stop. Horizontal only: the fall itself stays a plain
    // gravity fall, which is what building.shipCrashAnimDuration is sized against.
    this.vx *= Math.pow(CONFIG.debris.drag, dt);
    this.angle += this.spin*dt;
    this.curseT -= dt;
    if(this.yelpT !== null && (this.yelpT -= dt) <= 0) this._yelp(game);
    if(this.y >= GROUND_Y - 3){
      this.y = GROUND_Y - 3;
      this.dead = true;
      // A faller thrown off a low roof can be on the ground in a third of a second, well inside the
      // stagger window, and would otherwise be the one person in the crowd who never made a sound.
      // Yelping on impact instead is both audible and the right shape for it.
      this._yelp(game);
      game.spawnDebris(this.x, this.y, '#ff8b5e', 5);
      game.sound.play('civilianLost', { x: this.x, gain: 0.7 });
    }
  }

  static drawAll(list, ctx, camera){
    for(const c of list) c.draw(ctx, camera);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx < -30 || sx > W + 30) return;

    // Rotated about the figure's own centre (its 14px height runs from y-14 to y, so the middle is
    // y-7) rather than about its origin, which would swing the whole person around their feet
    // instead of tumbling them. The two rects are the same body and head as before, re-expressed
    // relative to that centre.
    ctx.save();
    ctx.translate(sx, this.y - 7);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#ff8b5e';
    ctx.fillRect(-3, -3, 6, 10);
    ctx.fillStyle = '#ffd8c2';
    ctx.fillRect(-2, -7, 4, 4);
    ctx.restore();

    // Deliberately outside the rotation above: the caption stays upright and readable while the
    // person it belongs to tumbles. Cleared of the figure's swept circle (radius ~8 about y-7) so a
    // spin never crosses the text.
    if(this.curse && this.curseT > 0){
      ctx.fillStyle = 'rgba(255,230,150,0.9)';
      ctx.font = 'bold ' + CONFIG.fallingCivilian.curseFontPx + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.curse, sx, this.y - 20);
      ctx.textAlign = 'left';
    }
  }
}
