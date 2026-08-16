import { W, H, GROUND_Y } from '../config.js';

// Sky, stars and the two parallax mountain ranges. Everything here is deterministic — a fixed star
// grid and a fixed sum of sine waves — so the skyline is stable frame-to-frame with no per-frame
// randomness to shimmer.
export class Backdrop {
  drawSky(ctx){
    const g = ctx.createLinearGradient(0,0,0,GROUND_Y);
    g.addColorStop(0,'#050812'); g.addColorStop(1,'#0a1830');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,GROUND_Y);
    // fixed in screen space — no camera term at all, so the star field stays still rather than
    // scrolling with the camera (and, as a side effect, has nothing to visibly "reset" at the world seam)
    for(let i=0;i<40;i++){
      const sx=(i*137)%W;
      ctx.fillStyle='rgba(255,255,255,'+(0.15+0.15*Math.sin(i))+')';
      ctx.fillRect(sx,(i*53)%GROUND_Y,2,2);
    }
  }

  drawMountains(ctx, camera){
    // parallax factors cut to 1/3 of their previous values (0.15->0.05, 0.32->0.1067), per Mike's
    // request — both ranges drift substantially slower, far range still slower than near
    this._layer(ctx, camera, GROUND_Y-28, 34, 0.05, 1.0, '#121c2e');   // far range: slow drift, low relief, muted
    this._layer(ctx, camera, GROUND_Y-6,  58, 0.1067, 1.6, '#0d1424'); // near range: faster drift, taller peaks, darker
  }

  // each ridge is a deterministic sum of a few sine waves sampled against the camera position scaled
  // by a layer-specific parallax factor well under 1, so both layers drift far slower than the
  // foreground buildings, and the two layers drift at different rates relative to each other for a
  // sense of depth
  _ridge(sx, offset, freqScale){
    const wx = sx + offset;
    return Math.sin(wx*0.006*freqScale)*0.55 + Math.sin(wx*0.017*freqScale+2.1)*0.3 + Math.sin(wx*0.041*freqScale+5.4)*0.15;
  }

  _layer(ctx, camera, baseY, amp, parallax, freqScale, color){
    // camera.continuousX (never wraps) rather than camera.x (wraps at the world seam) — see the
    // Camera class for why: using the wrapped value made the ridge line visibly jump every time the
    // player crossed x=0/WORLD_W.
    const offset = camera.continuousX*parallax;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const step = 12;
    for(let sx=0; sx<=W; sx+=step) ctx.lineTo(sx, baseY - this._ridge(sx, offset, freqScale)*amp);
    ctx.lineTo(W, baseY - this._ridge(W, offset, freqScale)*amp);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
