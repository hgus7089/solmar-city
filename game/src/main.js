// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between title, play, paused, busted, wasted and mission-complete.
//
// ?seed=N fixes the city. ?shot=start|play|end|docks (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { MUTE_KEY, STEP } from './config.js';
import { beginPlay, createWorld, respawn, stepWorld, worldUi } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { readSave } from './save.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const save = readSave();
const state = createWorld(seed, save);
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

function announce(message) {
  status.textContent = message;
}

function screenUi() {
  const ui = worldUi(state);
  ui.hasSave = !!save;
  ui.lost = state.screenData.lost || 0;
  ui.completeTitle = state.screenData.title ? `${state.screenData.title} — complete` : '';
  ui.completeReward = state.screenData.reward ? `Reward: $${state.screenData.reward}` : '';
  return ui;
}

function runShot(name) {
  const scene = stageShot(name, state, audio, renderer);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let lastAnnounced = '';

  function announceScreen() {
    const screen = state.screen;
    if (screen === lastAnnounced) return;
    lastAnnounced = screen;
    if (screen === SCREEN_TITLE) announce('Solmar City. Press Enter to start.');
    else if (screen === SCREEN_PLAY) announce('Playing.');
    else if (screen === SCREEN_PAUSED) announce('Paused.');
    else if (screen === SCREEN_OVER) announce(`Wasted. You lost $${state.screenData.lost || 0}. Press Enter to wake up at the hospital.`);
    else if (screen === SCREEN_BUSTED) announce(`Busted. You lost $${state.screenData.lost || 0}. Press Enter to leave the station.`);
    else if (screen === SCREEN_COMPLETE) announce(`Mission complete: ${state.screenData.title || ''}. Reward $${state.screenData.reward || 0}. Press Enter to keep playing.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Mouse aim: the renderer knows where the mouse points in the world.
    const m = input.mouse();
    const w = renderer.screenToWorld(m.x, m.y);
    input.aim.x = w.x;
    input.aim.y = w.y;
    input.aim.active = true;
    let actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      actions &= ~ACTION_MUTE;
    }
    // Screen transitions consume the press; the world never sees it.
    const screen = state.screen;
    let consumed = false;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        beginPlay(state);
        consumed = true;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        state.screen = SCREEN_PAUSED;
        consumed = true;
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        state.screen = SCREEN_PLAY;
        consumed = true;
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        respawn(state);
        consumed = true;
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        state.screen = SCREEN_PLAY;
        state.screenData = {};
        consumed = true;
      }
    }
    const stepActions = consumed ? 0 : actions;
    let first = true;
    while (accumulator >= STEP) {
      stepWorld(state, input, first ? stepActions : 0, STEP, audio, renderer);
      accumulator -= STEP;
      first = false;
    }
    announceScreen();
    renderer.draw(state, state.screen, screenUi());
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === SCREEN_PLAY) {
      state.screen = SCREEN_PAUSED;
    }
  });

  announce('Solmar City. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
