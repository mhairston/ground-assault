import { CONFIG, setViewportWidth } from './config.js';
import { Game } from './Game.js';

// Entry point: size the canvas, build the game, start the loop.
const canvas = document.getElementById('c');
canvas.height = CONFIG.world.canvasH;

// The view fills the window up to CONFIG.world.maxCanvasW, per Mike's request. Only the viewport
// changes — the world stays WORLD_W wide, so a bigger window means seeing more of it at once rather
// than the same view stretched. setViewportWidth publishes the new width to every module through the
// live `W` binding; the HUD and legend are pinned to the same width so the chrome stays lined up with
// the canvas. Assigning canvas.width also clears the canvas, which is harmless — the next frame
// redraws everything anyway.
const fitToWindow = () => {
  const w = setViewportWidth(window.innerWidth - CONFIG.world.canvasMarginX);
  canvas.width = w;
  for(const id of ['hud','legend']) document.getElementById(id).style.width = w + 'px';
};

fitToWindow();
window.addEventListener('resize', fitToWindow);

const game = new Game(canvas);
game.start();

// handy for poking at state from the devtools console
window.game = game;
