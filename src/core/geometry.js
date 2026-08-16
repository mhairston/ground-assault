import { W, WORLD_W } from '../config.js';

// The world is a horizontal cylinder: x wraps at WORLD_W. Everything that compares two world x
// positions has to go through wrapDelta rather than plain subtraction, or distances break at the
// seam. Kept as free functions (not methods) because they're pure math over the world's size and
// every module — entities, collisions, rendering, radar — needs them.

export function wrapX(x){ x = x % WORLD_W; if(x<0) x += WORLD_W; return x; }

// shortest signed distance from a to b, accounting for the wraparound seam
export function wrapDelta(a,b){ let d=(b-a+WORLD_W/2)%WORLD_W - WORLD_W/2; if(d<-WORLD_W/2) d+=WORLD_W; return d; }

// world x -> screen x for a camera centered at camX
export function relX(camX, worldX){ let dx = ((worldX - camX + WORLD_W/2) % WORLD_W + WORLD_W) % WORLD_W - WORLD_W/2; return W/2 + dx; }
