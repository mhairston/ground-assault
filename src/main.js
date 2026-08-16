import { CONFIG } from './config.js';
import { Game } from './Game.js';

// Entry point: size the canvas off CONFIG (one source of truth for the world's dimensions), build
// the game, start the loop.
const canvas = document.getElementById('c');
canvas.width = CONFIG.world.canvasW;
canvas.height = CONFIG.world.canvasH;

const game = new Game(canvas);
game.start();

// handy for poking at state from the devtools console
window.game = game;
