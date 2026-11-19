// The screenshot scenes behind ?shot=start|play|end|docks. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same seed
// always gives the same frame. The capture script waits for window.__shotReady.
import { STEP } from './config.js';
import { wrapAngle } from './entities.js';
import { addHeat } from './wanted.js';
import { startMission } from './missions.js';
import { stepWorld, worldUi } from './world.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 10;
const PLAY_SECONDS = 14;
const DOCKS_SECONDS = 2.5;

function dummyInput() {
  return {
    steer() { return { x: 0, y: 0 }; },
    running() { return false; },
    mouseHeld() { return false; },
    mouse() { return { x: 0, y: 0 }; },
    aim: { x: 0, y: 0, active: false },
    takeActions() { return 0; },
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Drive the roads like traffic does: follow the lane 140 ahead, cruise at a speed the
 *  corners can take, and turn at the end of each road so the car loops the city clockwise.
 *  Point-steering at full speed cut corners through buildings and wrecked the car. */
function createDriver(state) {
  const input = dummyInput();
  let route = { axis: 'x', line: 1800, dir: 1 };
  const horizontals = state.city.lines.horizontal;
  const verticals = state.city.lines.vertical;
  function nearestLine(lines, v) {
    let best = lines[0];
    for (const l of lines) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
    return best;
  }
  input.steer = () => {
    const car = state.player.car;
    if (!car) return { x: 0, y: 0 };
    const lane = route.axis === 'x' ? (route.dir === 1 ? -26 : 26) : (route.dir === 1 ? 26 : -26);
    let targetX;
    let targetY;
    if (route.axis === 'x') {
      targetX = route.line + lane;
      targetY = car.y + route.dir * 140;
    } else {
      targetX = car.x + route.dir * 140;
      targetY = route.line + lane;
    }
    const desired = Math.atan2(targetY - car.y, targetX - car.x);
    const diff = wrapAngle(desired - car.angle);
    const steerX = clamp(diff * 2.2, -1, 1);
    // Cruise control: the corners only work at a moderate speed.
    const speed = Math.abs(car.speed);
    const throttle = speed < 380 ? 0.55 : (speed > 440 ? -0.5 : 0);
    // At the end of a road, turn onto the nearest crossing road, clockwise round the city.
    if (route.axis === 'x' && route.dir === 1 && car.y > 2350) {
      route = { axis: 'y', line: nearestLine(horizontals, car.y), dir: 1 };
    } else if (route.axis === 'y' && route.dir === 1 && car.x > 3350) {
      route = { axis: 'x', line: nearestLine(verticals, car.x), dir: -1 };
    } else if (route.axis === 'x' && route.dir === -1 && car.y < 250) {
      route = { axis: 'y', line: nearestLine(horizontals, car.y), dir: -1 };
    } else if (route.axis === 'y' && route.dir === -1 && car.x < 250) {
      route = { axis: 'x', line: nearestLine(verticals, car.x), dir: 1 };
    }
    return { x: steerX, y: -throttle };
  };
  return input;
}

/** On foot at the docks: aim at the nearest gang member and shoot, closing in. */
function createShooter(state) {
  const input = dummyInput();
  input.mouseHeld = () => state.enemies.some((e) => e.health > 0);
  input.steer = () => {
    const alive = state.enemies.filter((e) => e.health > 0);
    if (!alive.length) return { x: 0, y: 0 };
    let best = alive[0];
    let bestD = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    input.aim.x = best.x;
    input.aim.y = best.y;
    if (bestD > 220) {
      const desired = Math.atan2(best.y - state.player.y, best.x - state.player.x);
      return { x: Math.cos(desired), y: Math.sin(desired) };
    }
    return { x: 0, y: 0 };
  };
  return input;
}

function uiFor(state) {
  const ui = worldUi(state);
  ui.hasSave = false;
  ui.lost = state.screenData.lost || 0;
  ui.completeTitle = state.screenData.title ? `${state.screenData.title} — complete` : '';
  ui.completeReward = state.screenData.reward ? `Reward: $${state.screenData.reward}` : '';
  return ui;
}

/**
 * Set `state` to the named scene and return the screen to draw over it and the HUD
 * the renderer paints. Any other name stages the title. If the autopilot gets the
 * player busted, wasted or through the mission, the scene is put back on its feet
 * for the frame — the screenshot is the scene, not the ending.
 */
export function stageShot(name, state, audio, renderer) {
  if (name === 'play') {
    // Hot Wheels, mid-chase: the player has the Comet GT and two stars of heat.
    state.missions.done = [0];
    startMission(state.missions, state, 1);
    const comet = state.cars.find((c) => c.missionCar === 'comet');
    const player = state.player;
    player.x = comet.x;
    player.y = comet.y;
    player.car = comet;
    comet.driver = 'player';
    player.onFoot = false;
    player.angle = comet.angle;
    state.screen = 'play';
    const events = [];
    addHeat(state.wanted, 40, state.time, events);
    const driver = createDriver(state);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      stepWorld(state, driver, 0, STEP, audio, renderer);
      if (state.screen !== 'play') break;
      // Keep the heat at two stars: it would decay away on its own in 14 seconds.
      if (state.wanted.stars < 2) addHeat(state.wanted, 15, state.time, []);
    }
    state.damageFlash = 0;
    if (state.screen !== 'play') {
      state.screen = 'play';
      state.player.health = 100;
    }
    return { screen: SCREEN_PLAY, ui: uiFor(state) };
  }
  if (name === 'end') {
    // Mission complete: walk into the café and the panel comes up.
    startMission(state.missions, state, 0);
    state.player.x = 1800;
    state.player.y = 1800;
    state.screen = 'play';
    const input = dummyInput();
    for (let i = 0; i < 2; i += 1) stepWorld(state, input, 0, STEP, audio, renderer);
    return { screen: SCREEN_COMPLETE, ui: uiFor(state) };
  }
  if (name === 'docks') {
    // Dockside Rumble: a pistol shootout with the Marinos. The player starts a street
    // away, so the frame catches the shootout mid-fight, not the aftermath.
    state.missions.done = [0, 1, 2, 3];
    startMission(state.missions, state, 4);
    state.player.x = 2800;
    state.player.y = 2000;
    state.player.angle = 0;
    state.screen = 'play';
    const shooter = createShooter(state);
    for (let i = 0; i < DOCKS_SECONDS / STEP; i += 1) {
      stepWorld(state, shooter, 0, STEP, audio, renderer);
      if (state.screen !== 'play') break;
    }
    state.damageFlash = 0;
    if (state.screen !== 'play') {
      state.screen = 'play';
      state.player.health = 100;
    }
    return { screen: SCREEN_PLAY, ui: uiFor(state) };
  }
  // start: the title over a living city, panned across downtown.
  const input = dummyInput();
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    stepWorld(state, input, 0, STEP, audio, renderer);
  }
  return { screen: SCREEN_TITLE, ui: uiFor(state) };
}
