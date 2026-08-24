// The DOM strip above/below the canvas. Wrapped in a class so nothing else in the game has to know
// element ids, and so a headless/test harness can substitute a stub.
export class Hud {
  constructor(doc = document){
    this.scoreEl = doc.getElementById('score');
    this.livesEl = doc.getElementById('lives');
    this.modeEl = doc.getElementById('modeLabel');
    this.itemsEl = doc.getElementById('itemsLabel');
    this.debugEl = doc.getElementById('debugLabel');
    this.audioEl = doc.getElementById('audioLabel');
    this.score = 0;
    this.wave = 1;
    this.enemies = 0;
  }

  setScore(score){ this.score = score; this._renderScore(); }
  setWaveAndEnemies(wave, enemies){ this.wave = wave; this.enemies = enemies; this._renderScore(); }
  setLives(lives){ this.livesEl.textContent = 'SHIPS ' + lives; }
  setMode(text){ this.modeEl.textContent = text; }
  setItems(parts){ this.itemsEl.textContent = parts.join('   '); }
  setDebugShipInvuln(on){ this.debugEl.textContent = on ? 'DEBUG: SHIP INVULNERABLE (0)' : ''; }
  setAudio(muted){ this.audioEl.textContent = muted ? 'SOUND OFF (M)' : 'SOUND ON (M)'; }

  _renderScore(){
    this.scoreEl.textContent = 'SCORE ' + this.score + '   WAVE ' + this.wave + '   ENEMIES ' + this.enemies;
  }
}
