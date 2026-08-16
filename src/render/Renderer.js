import { CONFIG, W, H, GROUND_Y } from '../config.js';
import { Backdrop } from './Backdrop.js';
import { Radar } from './Radar.js';
import { Humanoid } from '../entities/Humanoid.js';
import { Roamer } from '../entities/Roamer.js';
import { Bomber } from '../entities/Bomber.js';
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
    ctx.textAlign = 'left';
  }

  drawGameOver(ctx, game){
    if(!game.gameOver) return;
    ctx.textAlign='center';
    ctx.fillStyle='#ff5e7a'; ctx.font='bold 28px monospace'; ctx.fillText('GAME OVER', W/2, H/2-72);
    ctx.fillStyle='#eaffff'; ctx.font='15px monospace'; ctx.fillText('FINAL SCORE: ' + game.score, W/2, H/2-44);
    ctx.fillStyle='#8ff0ff'; ctx.font='13px monospace'; ctx.fillText('HIGH SCORES', W/2, H/2-20);
    const list = game.finalHighScores || game.highScores.load();
    ctx.fillStyle='#cfe8ff'; ctx.font='13px monospace';
    for(let i=0;i<Math.min(5,list.length);i++) ctx.fillText((i+1)+'. '+list[i], W/2, H/2+2+i*16);
    ctx.fillStyle='#7a95b0'; ctx.font='12px monospace';
    // kept verbatim from the original — note it predates the P-to-restart key (see the legend under
    // the canvas), so it's arguably stale copy rather than a description of the only way out
    ctx.fillText('refresh to retry', W/2, H/2+2+Math.min(5,list.length)*16+16);
    ctx.textAlign='left';
  }
}
