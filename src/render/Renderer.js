import { CONFIG, W, H, GROUND_Y } from '../config.js';
import { Backdrop } from './Backdrop.js';
import { Radar } from './Radar.js';
import { Humanoid } from '../entities/Humanoid.js';
import { Roamer } from '../entities/Roamer.js';
import { Bomber } from '../entities/Bomber.js';
import { Kamikaze } from '../entities/Kamikaze.js';
import { Bomb } from '../entities/Bomb.js';
import { FallingCaptive } from '../entities/FallingCaptive.js';
import { PlayerBullet, EnemyBullet } from '../entities/Bullet.js';
import { WaveManager } from '../systems/WaveManager.js';

// Owns the draw order and the full-screen overlays. Every entity knows how to draw itself; this
// class decides who gets drawn, in what order, and what goes on top.
export class Renderer {
  constructor(ctx, game){
    this.ctx = ctx;
    this.game = game;
    this.backdrop = new Backdrop();
    this.radar = new Radar();
  }

  draw(){
    const ctx = this.ctx, game = this.game, camera = game.camera;
    ctx.clearRect(0,0,W,H);
    this.backdrop.drawSky(ctx);
    this.backdrop.drawMountains(ctx, camera);

    if(game.mode==='interior'){
      game.interior.draw(ctx);
      this.radar.draw(ctx, game);
      this.drawGameOver(ctx, game);
      this.drawPaused(ctx, game);
      return;
    }

    ctx.fillStyle = '#1b2a1f'; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
    ctx.strokeStyle = '#3a5a3f'; ctx.beginPath(); ctx.moveTo(0,GROUND_Y); ctx.lineTo(W,GROUND_Y); ctx.stroke();

    game.scorches.draw(ctx, camera);
    for(const b of game.buildings) b.draw(ctx, camera);
    game.pickups.draw(ctx, camera);
    Humanoid.drawAll(game.humanoids, ctx, camera);
    Roamer.drawAll(game.roamers, ctx, camera);
    Bomber.drawAll(game.bombers, ctx, camera);
    Kamikaze.drawAll(game.kamikazes, ctx, camera);
    Bomb.drawAll(game.bombs, ctx, camera);
    game.debris.draw(ctx, camera);
    game.ship.draw(ctx, camera);
    FallingCaptive.drawAll(game.fallingCaptives, ctx, camera);
    if(game.mode==='foot') game.pilot.draw(ctx, camera);
    PlayerBullet.drawAll(game.playerBullets, ctx, camera);
    EnemyBullet.drawAll(game.enemyBullets, ctx, camera);

    if(game.superbombFlash > 0){
      ctx.fillStyle = `rgba(200,150,255,${(game.superbombFlash/CONFIG.pickup.flashDuration)*0.4})`;
      ctx.fillRect(0,0,W,H);
    }

    this.radar.draw(ctx, game);
    // draw order preserved from the original: the GAME OVER screen goes down first, so a WAVE
    // COMPLETE panel that happens to still be up dims it and sits on top rather than the reverse
    this.drawGameOver(ctx, game);
    this.drawShipLost(ctx, game);
    this.drawWaveComplete(ctx, game);
    this.drawPaused(ctx, game);
  }

  drawPaused(ctx, game){
    if(!game.paused) return;
    ctx.fillStyle = 'rgba(5,8,16,0.6)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaffff'; ctx.font = 'bold 28px monospace';
    ctx.fillText('PAUSED', W/2, H/2-4);
    ctx.fillStyle = '#8ff0ff'; ctx.font = '13px monospace';
    ctx.fillText('PRESS P TO RESUME', W/2, H/2+22);
    ctx.textAlign = 'left';
  }

  drawShipLost(ctx, game){
    if(!(game.respawn && game.respawn.stage === 'showLives')) return;
    ctx.fillStyle = 'rgba(5,8,16,0.55)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8b5e'; ctx.font = 'bold 24px monospace';
    ctx.fillText('SHIP LOST', W/2, H/2-14);
    ctx.fillStyle = '#eaffff'; ctx.font = '16px monospace';
    ctx.fillText('LIVES LEFT: ' + game.lives, W/2, H/2+16);
    ctx.textAlign = 'left';
  }

  drawWaveComplete(ctx, game){
    // hidden once the game is over, per Mike's request — a wave completing right around the final
    // death could otherwise leave this showing (or fighting for the same screen space) underneath/
    // alongside the GAME OVER panel for the rest of its completeOverlayDuration
    if(game.gameOver) return;
    const stats = game.waves.statsToShow;
    if(!(game.waves.complete && stats)) return;
    ctx.fillStyle = 'rgba(5,8,16,0.6)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ff0ff'; ctx.font = 'bold 24px monospace';
    ctx.fillText('WAVE ' + WaveManager.word(stats.number) + ' COMPLETE', W/2, H/2-30);
    ctx.fillStyle = '#eaffff'; ctx.font = '15px monospace';
    ctx.fillText('ENEMIES DESTROYED: ' + stats.destroyed, W/2, H/2);
    ctx.fillText('CIVILIANS ABDUCTED: ' + stats.abductions, W/2, H/2+22);
    ctx.fillText('CIVILIANS KILLED: ' + stats.deaths, W/2, H/2+44);
    ctx.fillText('CIVILIANS RESCUED: ' + stats.rescues, W/2, H/2+66);
    ctx.textAlign = 'left';
  }

  drawGameOver(ctx, game){
    // waits gameOverDisplayDelay after the final death before appearing, per Mike's request, so the
    // death explosion plays out undisturbed first — see Game.loseLife/update
    if(!game.gameOver || game.gameOverDisplayTimer > 0) return;
    ctx.textAlign='center';

    // Every line is collected here instead of drawn immediately, so the backing panel below can be
    // measured and sized to fit the actual content before anything is drawn over it. The layout
    // arithmetic (the running `y`) is exactly what it was before — only the "draw now" calls became
    // "record for later".
    const lines = [];
    let y = H/2-72;
    lines.push({ text:'GAME OVER', font:'bold 28px monospace', color:'#ff5e7a', y });
    y += 28;
    lines.push({ text:'FINAL SCORE: ' + game.finalScore, font:'15px monospace', color:'#eaffff', y });
    y += 24;
    // same stats block as the WAVE COMPLETE overlay, per Mike's request — but run-wide (see
    // WaveManager.finalStats) rather than just whatever the in-progress wave happened to hold
    const stats = game.waves.finalStats;
    lines.push({ text:'ENEMIES DESTROYED: ' + stats.destroyed, font:'14px monospace', color:'#eaffff', y }); y += 18;
    lines.push({ text:'CIVILIANS ABDUCTED: ' + stats.abductions, font:'14px monospace', color:'#eaffff', y }); y += 18;
    lines.push({ text:'CIVILIANS KILLED: ' + stats.deaths, font:'14px monospace', color:'#eaffff', y }); y += 18;
    lines.push({ text:'CIVILIANS RESCUED: ' + stats.rescues, font:'14px monospace', color:'#eaffff', y }); y += 24;
    lines.push({ text:'HIGH SCORES', font:'13px monospace', color:'#8ff0ff', y });
    y += 20;
    const list = game.finalHighScores || game.highScores.load();
    // which row is the score just earned — lastIndexOf, not indexOf: save() pushes the new score
    // onto the end before sorting, and a stable sort (which Array.prototype.sort is) keeps equal
    // values in their original relative order, so among any ties the new one lands last
    const newRow = game.finalScore > 0 ? list.lastIndexOf(game.finalScore) : -1;
    for(let i=0;i<Math.min(5,list.length);i++){
      lines.push({ text:(i+1)+'. '+list[i], font:'13px monospace', color:'#cfe8ff', y, highlighted: i===newRow });
      y += 16;
    }
    // kept verbatim from the original — note it predates the P-to-restart key (see the legend under
    // the canvas), so it's arguably stale copy rather than a description of the only way out
    lines.push({ text:'refresh to retry', font:'12px monospace', color:'#7a95b0', y: y+16 });

    // backing panel, per Mike's request, so the text stays readable over whatever's happening in the
    // world behind it — sized to the actual content (widest line, top/bottom extent) rather than a
    // guessed fixed box
    let maxWidth = 0;
    for(const line of lines){ ctx.font = line.font; maxWidth = Math.max(maxWidth, ctx.measureText(line.text).width); }
    const padX = 24, padTop = 22, padBottom = 14;
    const panelTop = lines[0].y - padTop;
    const panelBottom = lines[lines.length-1].y + padBottom;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(W/2 - maxWidth/2 - padX, panelTop, maxWidth + padX*2, panelBottom - panelTop, 12);
    ctx.fill();

    for(const line of lines){
      if(line.highlighted) this._drawHighlightedScore(ctx, line.text, W/2, line.y);
      else { ctx.fillStyle = line.color; ctx.font = line.font; ctx.fillText(line.text, W/2, line.y); }
    }
    ctx.textAlign='left';
  }

  // The row holding the score just earned, if it made the board — a warm glow behind the text plus
  // a steady shower of small sparks bursting outward and fading. Entirely a function of elapsed
  // time (performance.now()), like the bomb warning-ring pulse above, so it needs no particle array,
  // no per-frame update call, and nothing to reset when a new game starts.
  _drawHighlightedScore(ctx, text, cx, cy){
    const t = performance.now()/1000;

    const SPARKS = 14, CYCLE = 1.4;
    for(let i=0;i<SPARKS;i++){
      const phase = (i/SPARKS)*CYCLE;
      const progress = ((t + phase) % CYCLE) / CYCLE; // 0 (just born) -> 1 (fully faded)
      const angle = i * 2.399963; // golden angle — spreads the fixed spark count evenly, no Math.random() needed
      const speed = 50 + (i%5)*10;
      const dist = progress*speed*CYCLE;
      const px = cx + Math.cos(angle)*dist;
      const py = cy + Math.sin(angle)*dist*0.35 - progress*14; // flattened + a little lift, since the row it's bursting from is a single text line
      // capped well under full opacity, per Mike's request — full-bright sparks were the same gold as
      // the text itself, so one sitting near a digit read as blending into it rather than as a spark
      // behind it
      ctx.globalAlpha = (1-progress)*0.45;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(px, py, 1+(1-progress)*1.8, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const pulse = 0.5 + 0.5*Math.sin(t*3);
    ctx.save();
    ctx.shadowColor = `rgba(255,224,102,${0.5+0.3*pulse})`;
    ctx.shadowBlur = 8 + 6*pulse;
    ctx.fillStyle = '#ffe066'; ctx.font = 'bold 13px monospace';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }
}
