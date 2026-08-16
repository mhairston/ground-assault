// The DOM strip above/below the canvas. Wrapped in a class so nothing else in the game has to know
// element ids, and so a headless/test harness can substitute a stub.
export class Hud {
  constructor(doc = document){
    this.scoreEl = doc.getElementById('score');
    this.livesEl = doc.getElementById('lives');
    this.modeEl = doc.getElementById('modeLabel');
    this.itemsEl = doc.getElementById('itemsLabel');
  }

  setScore(score){ this.scoreEl.textContent = 'SCORE ' + score; }
  setLives(lives){ this.livesEl.textContent = 'SHIPS ' + lives; }
  setMode(text){ this.modeEl.textContent = text; }
  setItems(parts){ this.itemsEl.textContent = parts.join('   '); }
}
