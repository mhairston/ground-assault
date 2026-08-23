import { CONFIG, GROUND_Y, W, BUILDING_STYLES } from '../config.js';
import { relX, wrapX, wrapDelta } from '../core/geometry.js';

const BUILDING_MAX_HP = CONFIG.building.maxHp;
const HOLE_RADIUS = CONFIG.building.holeRadius; // 4x the original 7px hole radius, per Mike's request
// keep hole centers clamped so the (much bigger) circle still reads as contained within the
// building's silhouette
const HOLE_MARGIN = HOLE_RADIUS - 1;
// the ladder is drawn slightly right of the building's true center (see _drawLadder) — this is the
// single source of truth for that offset, so Pilot can center on the ladder's actual world x rather
// than the building's
const LADDER_OFFSET_X = 4;

export class Building {
  // smaller buildings have less HP than bigger ones, per Mike's request — scaled off footprint area
  // (width*height) relative to the original 90x90 block's area, which keeps its old flat 10 HP as the
  // reference point. Clamped so a tiny house isn't a one-hit kill and a huge tower isn't effectively
  // indestructible.
  static hpFor(width, height){
    const area = width * height;
    const scaled = Math.round(BUILDING_MAX_HP * (area / CONFIG.building.hpAreaReference));
    return Math.max(CONFIG.building.hpMin, Math.min(CONFIG.building.hpMax, scaled));
  }

  // number/placement/sizing of buildings is entirely driven by CONFIG.buildings — edit that array to
  // add, remove, resize, or reposition buildings.
  constructor({ x, width, height, style, hasLandingPad }){
    this.x = x;
    this.width = width;
    this.height = height;
    this.style = style;
    // slanted-roof houses don't get a ladder — there's no flat face to mount one against, per Mike's
    // request. Every other style keeps one. Houses also never get a landing pad, defensively enforced
    // here (on top of the default CONFIG.buildings list simply not marking any house that way) since a
    // slanted roof isn't a valid place for the ship to set down regardless of what CONFIG says.
    this.hasLadder = style !== 'house';
    this.hasLandingPad = !!hasLandingPad && style !== 'house';
    this.hp = Building.hpFor(width, height);
    this.maxHp = this.hp;
    this.destroyed = false;
    this.holes = [];
  }

  get roofY(){ return GROUND_Y - this.height; }
  // the sprite's y is its TOP edge; feet sit at y + h. Standing height on this roof = roofY - h.
  standY(spriteH){ return this.roofY - spriteH; }
  get doorX(){ return this.x - this.width/2 + 14; }
  get ladderX(){ return wrapX(this.x + LADDER_OFFSET_X); }
  containsX(x){ return Math.abs(wrapDelta(x, this.x)) < this.width/2; }

  // fire-suppressant repair: back to full HP with every hole patched (see Game.useFireSuppressant,
  // which owns the "is this a valid target" check and the debris burst)
  repair(){
    this.hp = this.maxHp;
    this.holes = [];
  }

  damage(hitX, hitY, game){
    this.hp--;
    // punch a permanent circular hole at the impact point (clamped inside the building's silhouette
    // so a glancing hit near the edge still reads as a clean hole, not one hanging off the wall)
    const roofY = this.roofY;
    const holeDx = Math.max(-(this.width/2-HOLE_MARGIN), Math.min(this.width/2-HOLE_MARGIN, wrapDelta(this.x, hitX)));
    const holeY = Math.max(roofY+HOLE_MARGIN, Math.min(GROUND_Y-HOLE_MARGIN, hitY));
    // each hole also gets its own randomized radius (±35% of the base), per Mike's request for more
    // variation in bomb damage — on top of the existing position jitter (see the bomb-impact call
    // site), so repeated hits no longer look like a row of identical uniform circles
    const holeRadius = HOLE_RADIUS * (1 - CONFIG.building.holeRadiusVarianceFrac + Math.random()*CONFIG.building.holeRadiusVarianceFrac*2);
    this.holes.push({ dx: holeDx, y: holeY, radius: holeRadius });
    game.spawnDebris(hitX, hitY, '#9a8a78', CONFIG.building.debrisOnHit);
    game.sound.play('buildingHit', { x: this.x });
    if(this.hp <= 0) this.collapse(game);
  }

  // destroys the building outright, regardless of remaining HP — used both by damage() above once hp
  // runs out, and directly by a kamikaze hitting the building (see Game.explodeKamikazeIntoBuilding),
  // per Mike's request that a kamikaze impact destroy it immediately. Guarded so a building already
  // gone can't be "destroyed" a second time (double score penalty, double debris) — damage() has no
  // such guard of its own and can still call this on an already-destroyed building if two things hit
  // it in the same tick, so the guard has to live here.
  collapse(game){
    if(this.destroyed) return;
    this.destroyed = true;
    game.addScore(CONFIG.scoring.perBuildingDestroyed); // -100 per building destroyed
    game.spawnDebris(this.x, GROUND_Y - this.height/2, '#6a5a48', CONFIG.building.debrisOnDestroy); // 4x the debris of a normal hit, per Mike's request
    game.sound.play('buildingCollapse', { x: this.x });
    // any human still alive within 10px of the building (i.e. close enough that its footprint plus
    // a 10px margin reaches them) goes down with it, per Mike's request
    for(const h of game.humanoids){
      if(h.alive && Math.abs(wrapDelta(h.x, this.x)) < this.width/2 + CONFIG.building.humanDeathRadiusPastEdge){
        h.alive = false;
        game.loseHumanoid(h, 'killed');
      }
    }
    // if the player was on/climbing this building when it came down, drop them to the ground
    game.pilot.dropFrom(this);
  }

  draw(ctx, camera){
    const sx = relX(camera.x, this.x);
    if(sx < -150 || sx > W+150) return;
    const x0 = sx - this.width/2;
    const roofY = this.roofY;

    if(this.destroyed){
      ctx.fillStyle = '#2a2420';
      for(let i=0;i<8;i++) ctx.fillRect(x0+i*(this.width/8), GROUND_Y-6-((i%3)*8), this.width/8-2, 6+((i%3)*8));
      return;
    }

    const styleCfg = BUILDING_STYLES[this.style] || BUILDING_STYLES.block;
    ctx.fillStyle = this._bodyColor(styleCfg);
    ctx.fillRect(x0, roofY, this.width, this.height);

    const winColor = `rgb(${styleCfg.window.join(',')})`;
    const accentColor = `rgb(${styleCfg.accent.join(',')})`;
    this._drawFacade(ctx, x0, roofY, winColor, accentColor);
    this._drawHoles(ctx, sx);

    // walkable rooftop ledge
    ctx.fillStyle = accentColor; ctx.fillRect(x0, roofY-3, this.width, 3);

    if(this.hasLandingPad) this._drawLandingPad(ctx, sx, roofY);
    if(this.hasLadder) this._drawLadder(ctx, sx, roofY);
  }

  // body color shifts from the style's base tone toward red as it takes hits; flashes bright red
  // when one hit from destruction — same damage language regardless of building style
  _bodyColor(styleCfg){
    const t = Math.min(1, (this.maxHp - this.hp) / (this.maxHp - 1));
    if(this.hp === 1 && Math.floor(performance.now()/150)%2===0) return '#ff4a4a';
    const base = styleCfg.base, dmg = [168,40,40];
    const r = Math.round(base[0] + (dmg[0]-base[0])*t);
    const g = Math.round(base[1] + (dmg[1]-base[1])*t);
    const bl = Math.round(base[2] + (dmg[2]-base[2])*t);
    return `rgb(${r},${g},${bl})`;
  }

  // per-style window/door/antenna treatment — deliberately literal pixel offsets, see the CONFIG
  // scope note: this is art direction, not gameplay tuning
  _drawFacade(ctx, x0, roofY, winColor, accentColor){
    const w = this.width;
    if(this.style === 'warehouse'){
      ctx.fillStyle = winColor;
      for(let wy=roofY+8; wy<GROUND_Y-10; wy+=14) ctx.fillRect(x0+4, wy, w-8, 4);
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(x0+w*0.14, GROUND_Y-26, w*0.2, 26);
      ctx.fillRect(x0+w*0.62, GROUND_Y-26, w*0.2, 26);
    } else if(this.style === 'tower'){
      ctx.fillStyle = winColor;
      for(let wy=roofY+14; wy<GROUND_Y-10; wy+=16) ctx.fillRect(x0+w/2-4, wy, 8, 8);
      ctx.strokeStyle = accentColor;
      ctx.beginPath(); ctx.moveTo(x0+w/2, roofY-3); ctx.lineTo(x0+w/2, roofY-16); ctx.stroke();
      if(Math.floor(performance.now()/500)%2===0){
        ctx.fillStyle = '#ff6a6a';
        ctx.beginPath(); ctx.arc(x0+w/2, roofY-16, 2, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = '#0d1420'; ctx.fillRect(x0+w/2-8, GROUND_Y-24, 16, 24);
    } else if(this.style === 'tenement'){
      ctx.fillStyle = winColor;
      for(let wy=roofY+10; wy<GROUND_Y-8; wy+=18)
        for(let wx=x0+8; wx<x0+w-8; wx+=20) ctx.fillRect(wx,wy,8,10);
      ctx.fillStyle = accentColor;
      for(let wy=roofY+30; wy<GROUND_Y-10; wy+=36) ctx.fillRect(x0-3, wy, w+6, 3);
      ctx.fillStyle = '#0d1420'; ctx.fillRect(x0+8, GROUND_Y-24, 16, 24);
    } else if(this.style === 'house'){
      // small house with a slanted (triangular) roof — purely a visual treatment; the walkable
      // rooftop plane drawn above stays flat like every other style, same as the roof ledge/ladder
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(x0-6, roofY);
      ctx.lineTo(x0+w/2, roofY-22);
      ctx.lineTo(x0+w+6, roofY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = winColor;
      ctx.fillRect(x0+8, roofY+14, 10, 10);
      ctx.fillRect(x0+w-18, roofY+14, 10, 10);
      ctx.fillStyle = '#0d1420'; ctx.fillRect(x0+w/2-8, GROUND_Y-22, 16, 22);
    } else { // 'block' — the original default look
      ctx.fillStyle = winColor;
      for(let wy=roofY+10; wy<GROUND_Y-8; wy+=18)
        for(let wx=x0+8; wx<x0+w-8; wx+=20) ctx.fillRect(wx,wy,8,10);
      ctx.fillStyle = '#0d1420'; ctx.fillRect(x0+8, GROUND_Y-24, 16, 24);
    }
  }

  // permanent circular holes at every impact point — erase through everything drawn so far to
  // reveal the sky/ground behind, then lay in a soft dark rim so it reads as a punched-through
  // crater rather than a flat cutout
  _drawHoles(ctx, sx){
    if(!this.holes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for(const h of this.holes){ ctx.beginPath(); ctx.arc(sx+h.dx, h.y, h.radius || HOLE_RADIUS, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for(const h of this.holes){ ctx.beginPath(); ctx.arc(sx+h.dx, h.y, h.radius || HOLE_RADIUS, 0, Math.PI*2); ctx.fill(); }
  }

  // a white landing pad marks the only rooftops the ship can actually set down on, per Mike's request
  // — everything else about the rooftop (walkable, ladder, pickups) works the same either way, this is
  // purely the ship-landing signal. Drawn as a painted strip right on the roof deck (in keeping with
  // this game's flat side-view rooftop elements, like the ledge/ladder), not a raised object. Sized
  // off the building's own width, capped so it doesn't dwarf a narrow roof or look lost on a wide one.
  _drawLandingPad(ctx, sx, roofY){
    const padW = Math.min(this.width - 12, 50), padH = 7, padY = roofY - padH;
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(sx-padW/2, padY, padW, padH);
    ctx.strokeStyle = '#aab3c4';
    ctx.strokeRect(sx-padW/2+1, padY+1, padW-2, padH-2);
    // two short corner ticks, like a simple helipad marking, so the pad still reads clearly at a glance
    ctx.fillStyle = '#3a4560';
    ctx.fillRect(sx-padW/2+4, padY+2, 3, padH-4);
    ctx.fillRect(sx+padW/2-7, padY+2, 3, padH-4);
  }

  _drawLadder(ctx, sx, roofY){
    ctx.strokeStyle = '#8a8f9a';
    const lx = sx + LADDER_OFFSET_X;
    const ladderTop = roofY;
    ctx.beginPath(); ctx.moveTo(lx-4,GROUND_Y); ctx.lineTo(lx-4,ladderTop); ctx.moveTo(lx+4,GROUND_Y); ctx.lineTo(lx+4,ladderTop); ctx.stroke();
    for(let ly=GROUND_Y-6; ly>ladderTop; ly-=10){ ctx.beginPath(); ctx.moveTo(lx-4,ly); ctx.lineTo(lx+4,ly); ctx.stroke(); }
  }
}
