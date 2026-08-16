import { CONFIG } from '../config.js';

// ---- session-storage high scores: top 10 kept across games in this browser tab/session ----
// Every storage access is wrapped, so a browser with localStorage disabled/full degrades to "no
// high scores" rather than throwing mid-game-over.
export class HighScores {
  constructor(key = CONFIG.highScores.key, maxEntries = CONFIG.highScores.maxEntries){
    this.key = key;
    this.maxEntries = maxEntries;
  }

  load(){
    try{ const list = JSON.parse(localStorage.getItem(this.key)); return Array.isArray(list) ? list : []; }
    catch(e){ return []; }
  }

  save(finalScore){
    const list = this.load();
    list.push(finalScore);
    list.sort((a,b) => b-a);
    const top = list.slice(0, this.maxEntries);
    try{ localStorage.setItem(this.key, JSON.stringify(top)); } catch(e){}
    return top;
  }
}
