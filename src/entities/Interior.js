import { W, H } from '../config.js';

// The little building-interior demo room. Currently unreachable: entering it is gated behind
// INTERIOR_ENABLED (false), per Mike's request to "disable the building-interior function for now".
// The logic is kept completely intact so re-enabling it is a one-line flip in config.js.
export class Interior {
  constructor(){ this.reset(); }

  reset(){
    this.building = null;
    this.px = 40;
    this.py = 150;
  }

  enter(building){
    this.building = building;
    this.px = 40;
    this.py = 150;
  }

  update(dt, game){
    const input = game.input;
    const speed = 100;
    this.px += (input.isDown('ArrowRight')?1:0)*speed*dt - (input.isDown('ArrowLeft')?1:0)*speed*dt;
    this.px = Math.max(10, Math.min(290, this.px));
    if(this.px > 150 && this.px < 230){
      if(input.isDown('ArrowRight')) this.py -= speed*0.5*dt;
      if(input.isDown('ArrowLeft')) this.py += speed*0.5*dt;
    }
    this.py = Math.max(40, Math.min(150, this.py));
    if(this.px < 20 && input.isDown('ArrowDown')){
      game.mode = 'foot';
      game.pilot.x = this.building.doorX;
    }
  }

  draw(ctx){
    ctx.fillStyle = '#101826'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#1c2a3f'; ctx.fillRect(40,60,880,360);
    ctx.strokeStyle = '#3a5170'; ctx.strokeRect(40,60,880,360);
    ctx.fillStyle = '#2c405c';
    for(let i=0;i<6;i++) ctx.fillRect(150+i*13, 150-i*18, 13, 18+i*18);
    ctx.fillStyle = '#7ec8ff'; ctx.font = '12px monospace';
    ctx.fillText('INTERIOR (demo room) — press DOWN near left wall to exit', 60, 400);
    ctx.fillText('Walk into the staircase (center) and hold RIGHT to go up, LEFT to come down', 60, 420);
    const px = 60+this.px*2.5, py = 100+this.py;
    ctx.fillStyle = '#ff8b5e'; ctx.fillRect(px-4,py-16,8,16);
  }
}
