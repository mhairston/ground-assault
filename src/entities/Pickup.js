import { CONFIG, GROUND_Y, W } from '../config.js';
import { relX, wrapDelta } from '../core/geometry.js';

export const MAX_CARRY = CONFIG.pickup.maxCarry;

// Rooftop pickups: superbombs (clear every enemy on screen) and fire-suppressant tanks (fully repair
// a nearby damaged building). Both are foot-only items — walk over one on a rooftop to collect it.
// Carried as a small stash (up to MAX_CARRY of each), not a strict single boolean — a boolean meant
// walking over a pickup while already holding one of that type was a silent no-op (the item just sat
// there, collected=false, forever), which read as a real bug: "sometimes I can't pick up items, I
// just walk past them." Now every rooftop pickup is always collectible up to the stash cap.
export class Pickup {
  constructor(type, building){
    this.type = type;               // 'superbomb' | 'firesuppressant'
    this.building = building;
    this.x = building.x;
    this.collected = false;
  }

  draw(ctx, camera){
    const b = this.building;
    if(b.destroyed) return;
    const sx = relX(camera.x, this.x);
    if(sx<-20||sx>W+20) return;
    const py = (GROUND_Y - b.height) - CONFIG.pickup.hoverHeight + Math.sin(performance.now()/260 + this.x)*1.5;
    if(this.type==='superbomb'){
      ctx.fillStyle = '#2a1a3a';
      ctx.beginPath(); ctx.arc(sx, py, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#c98bff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, py, 6, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+4, py-4); ctx.lineTo(sx+7, py-8); ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = '#c0392b'; ctx.fillRect(sx-4, py-6, 8, 12);
      ctx.fillStyle = '#eaffff'; ctx.fillRect(sx-3, py-1, 6, 2); ctx.fillRect(sx-1, py-4, 2, 6);
    }
  }
}

// Owns the pickups currently on the map plus their spawn timer.
export class PickupField {
  constructor(){ this.reset(); }

  reset(){
    this.items = [];
    this.spawnTimer = CONFIG.pickup.initialSpawnTimerBase + Math.random()*CONFIG.pickup.initialSpawnTimerRandRange;
  }

  spawn(game){
    // skip ladderless (house) roofs — since houses lost their ladder, a pickup spawned up there
    // would be permanently unreachable on foot
    const candidates = game.buildings.filter(b => !b.destroyed && b.hasLadder && !this.items.some(p=>p.building===b));
    if(!candidates.length) return;
    const b = candidates[Math.floor(Math.random()*candidates.length)];
    this.items.push(new Pickup(Math.random()<0.5 ? 'superbomb' : 'firesuppressant', b));
  }

  update(dt, game){
    this.spawnTimer -= dt;
    if(this.spawnTimer <= 0 && this.items.length < CONFIG.pickup.maxOnMap){
      this.spawn(game);
      this.spawnTimer = CONFIG.pickup.respawnTimerBase + Math.random()*CONFIG.pickup.respawnTimerRandRange;
    }
    // a pickup sitting on a building that gets destroyed goes down with it
    this.items = this.items.filter(p => !p.building.destroyed);

    const pilot = game.pilot;
    if(game.mode==='foot' && pilot.roofRef){
      for(const p of this.items){
        if(p.building !== pilot.roofRef || Math.abs(wrapDelta(pilot.x, p.x)) >= CONFIG.pickup.collectDist) continue;
        if(p.type==='superbomb' && pilot.superbombCount < MAX_CARRY){ pilot.superbombCount++; p.collected = true; }
        else if(p.type==='firesuppressant' && pilot.fireSuppressantCount < MAX_CARRY){ pilot.fireSuppressantCount++; p.collected = true; }
      }
      this.items = this.items.filter(p => !p.collected);
    }
  }

  draw(ctx, camera){
    for(const p of this.items) p.draw(ctx, camera);
  }
}
