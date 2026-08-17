// Keyboard state plus the simulation-speed control. Held keys are polled (isDown) by the entities
// that move every frame; the two one-shot actions (board/land, restart) are delivered as callbacks
// so a single physical press can never be re-triggered by a later frame reading a still-held key.
export class Input {
  constructor(speedSelectEl, { onBoardOrLand = () => {}, onRestart = () => {}, onGesture = () => {}, onMute = () => {} } = {}){
    this.keys = {};
    this.simSpeed = 1;
    this.speeds = [1,2,4,8];
    this.speedSelect = speedSelectEl;
    this.onBoardOrLand = onBoardOrLand;
    this.onRestart = onRestart;
    this.onGesture = onGesture;
    this.onMute = onMute;

    if(this.speedSelect){
      this.speedSelect.addEventListener('change', () => this.setSimSpeed(parseInt(this.speedSelect.value,10)));
    }
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  isDown(code){ return !!this.keys[code]; }

  // ---- simulation speed control (for quicker manual testing — Game runs game logic in substeps so
  // everything, including frame-based bullet motion, scales together instead of drifting out of sync) ----
  setSimSpeed(n){
    this.simSpeed = this.speeds.includes(n) ? n : 1;
    if(this.speedSelect) this.speedSelect.value = String(this.simSpeed);
  }

  _onKeyDown(e){
    // Browsers refuse to start audio until the page has been interacted with, so every keypress is
    // offered as the unlocking gesture — the manager builds its context once and ignores the rest.
    this.onGesture();
    this.keys[e.code] = true;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if(['Digit1','Digit2','Digit3','Digit4'].includes(e.code)) this.setSimSpeed(this.speeds[Number(e.code.slice(-1))-1]);
    // P restarts the game once it's over, per Mike's request — the handler itself no-ops any other
    // time (see Game), so it can't be mashed mid-game by accident
    if(e.code === 'KeyP') this.onRestart();
    // A boards/lands, per Mike's request (round 19, reverting rounds 16-18's fully-automatic version).
    // !e.repeat filters out the OS's key-auto-repeat events that fire while a key is held down, so this
    // only runs once per actual physical press, no matter how long A is then held — that's what makes it
    // safe for the takeoff glide to finish while the player is still holding A down: there's no repeat
    // event to immediately re-trigger a landing attempt from the same press. See Game.tryBoardOrLand().
    if(e.code === 'KeyA' && !e.repeat) this.onBoardOrLand();
    // M mutes/unmutes everything. !e.repeat so holding it doesn't strobe the mute state.
    if(e.code === 'KeyM' && !e.repeat) this.onMute();
  }
}
