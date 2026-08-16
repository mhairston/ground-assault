# Sound Effects Plan — Ground Assault

## Approach: Synthesized Web Audio API

All sound is generated procedurally with the Web Audio API — no external files, keeping the game a single self-contained HTML file. Every sound is a short synthesized waveform built from oscillators, noise buffers, filters, and gain envelopes. This is standard for browser chiptune-style games and adds zero load time.

A thin `SoundManager` class wraps the AudioContext and exposes one `play(id, options)` method. It handles:

- **Voice pooling** — each sound type gets a small pool (2–4 nodes) so rapid fire, multi-bomb explosions, and overlapping effects don't cut each other off.
- **Stereo panning** — sounds triggered by world objects pass their screen-x position; the manager maps it to a –1→+1 pan value so off-center explosions feel spatially correct. Off-screen events (far outside the viewport) are either inaudible or very quiet, matching how Defender-style games handle world audio.
- **Master volume + mute** — a single GainNode at the output bus. The `M` key (or a HUD toggle) flips mute; volume can be adjusted separately without losing the mute state.
- **One AudioContext** created lazily on the first user gesture (browser autoplay policy). Subsequent calls reuse it.

---

## Sound Inventory

### 1. Ship — flight

| Sound | Trigger | Character |
|---|---|---|
| **Engine hum** | Continuous while flying (not during auto-land/takeoff glide) | Low sawtooth drone, frequency scales with current speed (faster → slightly higher pitch). Fades in on takeoff, fades out on landing. |
| **Thrust burst** | Each frame thrust keys are held | Very subtle white-noise puff layered under the hum — gives texture without getting annoying. |
| **Auto-takeoff** | `ship.auto = 'takeoff'` begins | Rising two-tone chime (two short sine blips, interval of a fifth). |
| **Auto-landing** | `ship.auto = 'landing'` begins | Falling two-tone chime (mirror of takeoff). |

### 2. Ship — weapons

| Sound | Trigger | Character |
|---|---|---|
| **Laser shot** | Each bullet fired from ship | Short sharp square-wave blip (high freq, ~800 Hz, fast exponential decay ~80ms). Sounds like classic Defender pew. |
| **Burst cooldown click** | When the 6-shot burst ends and cooldown starts | A very soft low click/tick — subtle cue that the gun is reloading. |
| **Superbomb** | Superbomb activated | Big synthesized boom: pitched noise burst, wide filter sweep down from high to low over ~600ms. Screen-shake-worthy. Should be louder than other effects. |

### 3. On-foot player

| Sound | Trigger | Character |
|---|---|---|
| **Footsteps** | Walking left/right on ground or rooftop | Alternating soft low thumps (~10ms noise burst, one per step cycle). Subtle — don't let it clutter combat audio. |
| **Ladder climb** | Moving up/down a ladder | Quiet repeating metallic tick, period tied to climb speed. |
| **Upward shot** | Space pressed while on foot | Same laser blip as ship fire, but slightly lower pitched (grounded, less hi-fi). |
| **Board ship** | Pilot enters ship (`A` near ship) | Short ascending blip + soft mechanical "thunk." |
| **Exit ship** | Pilot exits ship after landing | Inverse: descending blip + thunk. |

### 4. Roamers

| Sound | Trigger | Character |
|---|---|---|
| **Roamer presence** | Ambient while ≥1 roamer is alive on screen | Very quiet pulsing drone (triangle wave, slow LFO modulation ~1 Hz). Sits below all other sounds. Gets slightly louder/faster as more roamers are on screen. |
| **Roamer gunshot** | Roamer fires at player | Mid-pitched buzz blip, shorter and buzzier than player laser — distinguishable by character, not just volume. |
| **Roamer capture** | Roamer grabs a civilian (capture event) | Unsettling descending glide tone — think the classic Defender "humanoid captured" alarm. Short, ~200ms. |
| **Roamer death** | Roamer destroyed (shot, rammed, superbombed) | Sharp crack + brief distorted buzz, decaying fast (~150ms). |

### 5. Bombers

| Sound | Trigger | Character |
|---|---|---|
| **Bomber engine** | While a bomber is on screen | Rhythmic low drone, slightly higher in freq than roamer hum, with a detune wobble matching the sine-wave zig-zag movement. |
| **Bomb drop** | Bomber releases a bomb | Soft "thwip" — short downward pitch glide, very quiet. |
| **Bomb in flight** | While a bomb is falling | Optional: very faint whistle, pitch rising slightly as it nears ground (Doppler-ish feel). Keep subtle. |
| **Bomb impact — hit building** | Bomb damages a building | Low thud + rumble, ~300ms. Medium weight. |
| **Bomb impact — ground** | Bomb hits open ground | Same but slightly duller, less resonant. |
| **Bomb intercepted** | Player bullet hits a bomb mid-air (+15 score) | Bright "ping" — reward sound, distinct from enemy-kill sound. |
| **Bomber death** | Bomber destroyed | Same debris sound as roamer death, but slightly lower pitch to differentiate. |

### 6. Buildings

| Sound | Trigger | Character |
|---|---|---|
| **Building hit** | `damageBuilding()` called, building survives | Low crack/crunch, short. Panned to building's screen position. |
| **Building collapse** | Building reaches 0 HP | Deep rumbling boom with long tail (~800ms). 64 debris fragments — lean into the drama. Louder than a bomb impact. |
| **Fire-suppressant spray** | Player uses fire-suppressant pickup | Soft hiss (~400ms, filtered white noise), followed by a soft chime — the "repaired" payoff note. |

### 7. Civilians

| Sound | Trigger | Character |
|---|---|---|
| **Civilian in danger** | Roamer closes within 100px (flee trigger) | Single short high-pitched yelp — sparse, not every civilian every time; max one yelp per second game-wide to avoid cacophony. |
| **Civilian rescued** | Player catches falling captive (+50 score) | Bright two-note ascending chime. Cheerful and distinct from the kill sounds. |
| **Civilian reaches door (safe)** | Human reaches building door and goes `safe` | Soft "door close" click — just enough to register the event. |
| **Civilian lost** | Humanoid dies/is successfully abducted (–50 score) | Brief sorrowful descending tone. Not too long — game moves fast. |

### 8. Pickups

| Sound | Trigger | Character |
|---|---|---|
| **Pickup collected** | Player walks over superbomb or fire-suppressant on rooftop | Bright ascending three-note arpeggio (classic power-up feel). Same for both types — differentiate by pitch: superbomb is lower, suppressant is higher. |

### 9. Score / UI

| Sound | Trigger | Character |
|---|---|---|
| **Wave complete** | Wave cleared, overlay appears | Fanfare: short ascending four-note melody, then a held chord. ~1 second. The most "musical" sound in the set. |
| **Ship lost** | Player loses a life (not final) | Descending three-note toll, minor. ~0.5s. |
| **Game over** | Final life lost | Longer descending run ending on a low held tone. Slightly dramatic. |
| **Restart** | P pressed during GAME OVER | Quick ascending blip — resets the audio mood. |

---

## Implementation Plan

### Phase 1 — AudioContext bootstrap & mute

Add a `SoundManager` object near the top of the game script (after constants, before game state). It holds the AudioContext (created on first play), a master GainNode, and a mute flag. Wire `M` to toggle mute. This can be done in isolation — nothing else changes yet.

### Phase 2 — One-shot sounds (simplest)

Implement the helper that builds an oscillator or noise buffer, applies a gain envelope, and connects to the master gain. Start with the easiest one-shot sounds: laser shot, roamer death, bomb impact. Validate they sound reasonable in-browser before adding more.

### Phase 3 — Panned one-shot sounds

Extend the helper to accept a screen-x position and route through a `StereoPannerNode` before the master gain. Apply to all world-positioned events (explosions, building hits, bomb drops, civilian sounds).

### Phase 4 — Looping / continuous sounds

Engine hum, roamer ambient drone, bomber engine — these need a start/stop lifecycle tied to game state, not a fire-and-forget call. Add `startLoop(id)` / `stopLoop(id)` methods. Connect engine hum speed to the ship's current velocity via a `setTargetAtTime` call on the oscillator frequency each frame (or every N frames to reduce overhead).

### Phase 5 — State-gated sounds

Mute or fade certain loops during cutscenes: engine hum off during auto-land/takeoff (replaced by the chime), all sounds except debris during the GAME OVER animation sequence, etc. Tie to existing `ship.auto` state and the game's `phase` variable.

### Phase 6 — Background music (drum track)

Add a looping white-noise drum pattern as the background rhythm track. It runs as a scheduled sequence of short Web Audio noise bursts rather than a looping buffer, which makes it easy to vary tempo and pattern without loading audio files.

**Drum voices — all from shaped white noise:**

| Voice | Character | How |
|---|---|---|
| **Kick** | Deep thud — low, punchy | White noise through a lowpass filter (~80 Hz cutoff), very short gain envelope (~60ms). Pitch-bends the filter cutoff downward on trigger for a "thump." |
| **Snare** | Snappy crack | White noise through a highpass filter (~1 kHz), short envelope (~80ms), slight bandpass resonance. |
| **Hi-hat (closed)** | Tight tick | White noise through a highpass filter (~8 kHz), very short envelope (~20ms), very quiet. |
| **Hi-hat (open)** | Sizzle | Same as closed but longer decay (~150ms), slightly louder. |

**Pattern — a simple 4/4 kick-snare loop (16 steps at 120 BPM):**

```
Step:    1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16
Kick:    X        X     X        X     X        X
Snare:            X              X              X
HH(cl):  X  X  X  X  X  X  X  X  X  X  X  X  X  X  X  X
HH(op):                 X              X
```

At 120 BPM each 16th-note step is 125ms. The sequencer uses `AudioContext.currentTime` and `setTimeout`/lookahead scheduling (the standard Web Audio "clock" pattern — schedule ~100ms ahead, fire a timer every 25ms) so the rhythm stays tight regardless of JS event loop jitter.

**Integration with game state:**

- Music starts when the game begins (first keypress unlocks AudioContext).
- Muted by the same `M` toggle as SFX, but routed through a separate `musicGain` sub-bus so it can be balanced independently.
- On **wave complete**: briefly cut the drums for the fanfare (~1s), then resume.
- On **GAME OVER**: fade out the drum track over ~1.5s rather than hard-cutting.
- On **restart**: fade back in.
- The roamer ambient drone still runs over the drum track — the drone is low and slow-pulsing, the drums are crisp transients, so they don't compete much. If they do clash in playtesting, lower the drone gain when music is active.

**Tempo variation (optional, implement after baseline):** bump BPM from 120→140 starting at wave 5, 140→160 at wave 8, to match the increasing difficulty. A `setTargetAtTime` on the step interval handles smooth ramp-up.

### Phase 7 — Polish & balance

- Playtest the full mix. The engine hum and ambient drone will likely need to be much quieter than they feel in isolation.
- Ensure bomb-impact and building-collapse don't clip (check gain values sum).
- Add per-category volume knobs if the mix is hard to balance (e.g. `sfxGain`, `ambientGain`, `musicGain`, `uiGain` sub-buses before the master).
- Gate the "civilian in danger" yelp to max once per second globally.

---

## Open questions

- **Wave-number pitch scaling?** Some Defender-style games pitch up the enemy ambient sound as waves get harder. Easy to add once the roamer drone is in. The tempo BPM bump (above) partially covers this for the music track.
- **Stereo field width.** The world is `WORLD_W` pixels wide; the screen is the viewport. Decide whether to scale pan to the screen viewport only (objects near the edge of the screen are fully panned) or to the full world (most sounds would be near center). Screen-relative panning is more dramatic and likely more fun.
- **Audio on mobile.** The game is currently desktop-only but if that changes, note that iOS requires a `touchstart` event to unlock the AudioContext, not just a `click` or `keydown`.
- **Drum pattern variation.** The 4/4 loop above is a solid baseline but will get repetitive over a long session. A second, slightly busier pattern (extra kick on step 13, open hi-hat on 10) that swaps in every 8 bars would help without adding much complexity.
