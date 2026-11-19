// The world: everything the game simulates, in one state object, stepped at a fixed
// 60 Hz. Traffic, pedestrians, police, missions, the wanted level, combat, effects
// and the screen transitions all meet here. The renderer only reads this state;
// main.js only feeds it input and hands it the audio and renderer for feedback.

import { PED, POLICE, TRAFFIC, WANTED } from './config.js';
import { generateCity, nearestRoad, randomRoadPoint, randomSidewalkPoint, resolveCircle } from './city.js';
import { createRandom } from './random.js';
import {
  EV_CAR_STOLEN, EV_CAR_WRECKED, EV_CRASH, EV_PED_HIT,
  collideCars, carsHitPeds, createCar, createPed, createPlayer,
  driveCar, placeOnRoad, stepPed, stepPlayerOnFoot, stepPoliceCar, stepTrafficCar,
} from './entities.js';
import {
  EV_COP_DOWN, EV_ENEMY_DOWN, EV_PED_DOWN, EV_PLAYER_HIT, EV_SHOT_FIRED,
  createBullets, enemyShoot, playerPunch, playerShoot, stepBullets,
} from './combat.js';
import { EV_BUSTED, EV_WASTED, EV_WANTED_CLEAR, EV_WANTED_UP, addHeat, createWanted, policeWanted, stepWanted } from './wanted.js';
import {
  EV_FARE_DONE, EV_MISSION_DONE, EV_MISSION_FAIL, EV_MISSION_STEP, EV_PACKAGE,
  checkPackages, createMissions, currentMarker, currentObjective, failMission,
  nextMissionIndex, startMission, updateMissions, updateTaxi,
} from './missions.js';
import { applySave, writeSave } from './save.js';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function nearPoint(state, x, y, radius) {
  return dist(state.player.x, state.player.y, x, y) < radius;
}

function addFx(state, kind, x, y, value) {
  state.fx.push({ kind, x, y, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, value: value || 0 });
}

function burstFx(state, kind, x, y, count, spread) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.random.range(0, Math.PI * 2);
    const speed = state.random.range(40, spread);
    state.fx.push({
      kind, x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.7, maxLife: 0.7, value: 0,
    });
  }
}

function spawnTrafficCar(state) {
  const car = createCar(state.random, 0, 0, 0, state.random.int(0, 4), 'traffic');
  placeOnRoad(car, state.city, state.random);
  state.cars.push(car);
  return car;
}

function spawnParkedCar(state) {
  const p = randomRoadPoint(state.city, state.random);
  const road = nearestRoad(p.x, p.y);
  const angle = road.axis === 'x'
    ? (state.random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
    : (state.random.chance(0.5) ? 0 : Math.PI);
  const car = createCar(state.random, p.x, p.y, angle, state.random.int(0, 4), 'parked');
  state.cars.push(car);
  return car;
}

function spawnPoliceCar(state) {
  const car = createCar(state.random, 0, 0, 0, 5, 'police');
  // Place it on a road 600–900 away so it rolls in with sirens, not on top of the player.
  for (let tries = 0; tries < 6; tries += 1) {
    placeOnRoad(car, state.city, state.random);
    if (dist(car.x, car.y, state.player.x, state.player.y) > 550) break;
  }
  state.cars.push(car);
  return car;
}

function spawnFootCop(state) {
  // Foot cops arrive near the player, on a sidewalk, so they can actually give chase.
  // A cop spawned at a random point across the city would be filtered out as too far.
  let x = state.player.x + 400;
  let y = state.player.y;
  for (let tries = 0; tries < 8; tries += 1) {
    const p = randomSidewalkPoint(state.city, state.random);
    const d = dist(p.x, p.y, state.player.x, state.player.y);
    if (d > 300 && d < 700) {
      x = p.x;
      y = p.y;
      break;
    }
  }
  const fixed = resolveCircle(state.city, x, y, 11);
  const ped = createPed(state.random, fixed.x, fixed.y, true);
  state.peds.push(ped);
  return ped;
}

function spawnPed(state) {
  const p = randomSidewalkPoint(state.city, state.random);
  const ped = createPed(state.random, p.x, p.y, false);
  state.peds.push(ped);
  return ped;
}

export function createWorld(seed, save) {
  const random = createRandom(seed);
  const city = generateCity(random);
  const player = createPlayer(1800, 2560);
  const state = {
    seed, random, city,
    player,
    cars: [], peds: [], enemies: [],
    bullets: createBullets(),
    fx: [], skids: [],
    wanted: createWanted(),
    missions: createMissions(city, random),
    time: 0,
    message: null,
    damageFlash: 0,
    screen: 'title',
    screenData: {},
    failedMission: -1,
    bestCash: 0,
    cameraX: undefined,
    cameraY: undefined,
    lastShot: -100,
    skidLast: null,
  };
  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(state);
  for (let i = 0; i < 6; i += 1) spawnParkedCar(state);
  for (let i = 0; i < PED.count; i += 1) spawnPed(state);
  if (save) {
    applySave(state, save);
    state.bestCash = save.bestCash || 0;
  }
  return state;
}

/** Start the story: the first mission, from the beach, if nothing is done yet. */
export function beginPlay(state) {
  state.screen = 'play';
  state.cameraX = undefined;
  state.cameraY = undefined;
  if (!state.missions.active && state.missions.done.length === 0) {
    startMission(state.missions, state, 0);
    state.message = { text: 'Welcome to Solmar — head to Café Solmar', timer: 5 };
  }
}

function setMessage(state, text, timer) {
  state.message = { text, timer: timer || 4 };
}

/** What the HUD shows: the objective line, the marker, the toast. */
export function worldUi(state) {
  const missions = state.missions;
  let objective = currentObjective(missions);
  let marker = currentMarker(missions, state);
  if (!missions.active) {
    const next = nextMissionIndex(missions);
    if (next === -1) {
      objective = 'All missions done — Solmar is yours. Free roam, taxi fares, packages.';
    } else if (state.nearCafe) {
      objective = `Press Enter to start: ${missions.defs[next].title}`;
    } else {
      objective = `Next mission: ${missions.defs[next].title} — go to Café Solmar`;
    }
    if (!marker) {
      marker = { x: state.city.landmarks.cafe.x, y: state.city.landmarks.cafe.y, label: 'Café Solmar', kind: 'mission' };
    }
  }
  return {
    objective,
    objectiveTitle: missions.active ? missions.active.title : 'SOLMAR CITY',
    message: state.message,
    marker,
  };
}

function handleEvents(state, events, audio, renderer) {
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    if (e.type === EV_CRASH) {
      audio.crash(e.strength);
      burstFx(state, 'spark', e.x, e.y, 4, 160);
      burstFx(state, 'smoke', e.x, e.y, 2, 60);
      renderer.addShake(e.strength * 0.5);
    } else if (e.type === EV_PED_HIT) {
      if (e.byPlayer) {
        addHeat(state.wanted, WANTED.hitPed, state.time, events);
        setMessage(state, 'You hit a pedestrian — the police were called', 3);
      }
      audio.crash(0.25);
      burstFx(state, 'smoke', e.x, e.y, 2, 60);
    } else if (e.type === EV_CAR_STOLEN) {
      addHeat(state.wanted, WANTED.stealCar, state.time, events);
      setMessage(state, 'Car stolen — the owner called the cops', 3);
      audio.pickup();
    } else if (e.type === EV_CAR_WRECKED) {
      audio.crash(1);
      burstFx(state, 'spark', e.x, e.y, 8, 220);
      burstFx(state, 'smoke', e.x, e.y, 5, 80);
      renderer.addShake(0.7);
    } else if (e.type === EV_SHOT_FIRED) {
      audio.shoot();
      addFx(state, 'muzzle', e.x + Math.cos(e.angle) * 26, e.y + Math.sin(e.angle) * 26, 0);
      state.lastShot = state.time;
      if (e.from === 'player') addHeat(state.wanted, WANTED.shoot, state.time, events);
    } else if (e.type === EV_PED_DOWN) {
      addHeat(state.wanted, WANTED.hitPed, state.time, events);
      audio.punch();
    } else if (e.type === EV_COP_DOWN) {
      addHeat(state.wanted, WANTED.killCop, state.time, events);
      audio.punch();
      if (state.player.weapon !== 'pistol') {
        state.player.weapon = 'pistol';
        state.player.ammo = 24;
        setMessage(state, 'You took the officer\u2019s pistol', 4);
      } else {
        state.player.ammo += 12;
        setMessage(state, 'Picked up 12 rounds', 3);
      }
    } else if (e.type === EV_ENEMY_DOWN) {
      state.player.cash += 50;
      addFx(state, 'cash', e.x, e.y - 20, 50);
      audio.cash();
    } else if (e.type === EV_PLAYER_HIT) {
      state.damageFlash = 1;
      renderer.addShake(0.3);
      audio.punch();
    } else if (e.type === EV_WANTED_UP) {
      setMessage(state, `Wanted level ${e.stars} — lose the cops`, 3);
    } else if (e.type === EV_WANTED_CLEAR) {
      setMessage(state, 'You lost the cops', 3);
    } else if (e.type === EV_BUSTED) {
      const fine = Math.max(50, Math.round(state.player.cash * 0.1));
      state.player.cash -= fine;
      state.screenData = { lost: fine };
      state.screen = 'busted';
      audio.busted();
      if (state.missions.active) failMission(state.missions, state, events);
      writeSave(state);
    } else if (e.type === EV_WASTED) {
      const lost = Math.max(50, Math.round(state.player.cash * 0.2));
      state.player.cash -= lost;
      state.screenData = { lost };
      state.screen = 'over';
      audio.wasted();
      if (state.missions.active) failMission(state.missions, state, events);
      writeSave(state);
    } else if (e.type === EV_MISSION_STEP) {
      setMessage(state, 'Objective updated', 3);
      audio.pickup();
    } else if (e.type === EV_MISSION_DONE) {
      state.screenData = { title: e.title, reward: e.reward };
      state.screen = 'complete';
      audio.missionDone();
      writeSave(state);
    } else if (e.type === EV_MISSION_FAIL) {
      setMessage(state, `Mission failed: ${e.title} — try again`, 4);
    } else if (e.type === EV_FARE_DONE) {
      audio.cash();
      setMessage(state, `Fare complete +$${e.fare}`, 3);
      addFx(state, 'cash', state.player.x, state.player.y - 30, e.fare);
      writeSave(state);
    } else if (e.type === EV_PACKAGE) {
      audio.cash();
      setMessage(state, 'Hidden package found +$100', 3);
      addFx(state, 'cash', e.x, e.y - 20, 100);
      writeSave(state);
    }
  }
}

function stepAmbient(state, dt) {
  // The city stays alive behind the title and the panels: traffic and peds move.
  const events = [];
  for (const car of state.cars) {
    if (car.driver === 'traffic') stepTrafficCar(car, state.cars, dt, state.city, state.random);
  }
  collideCars(state.cars, events);
  for (const ped of state.peds) {
    stepPed(ped, dt, state.city, state.random, null);
  }
  for (const f of state.fx) {
    f.life -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  state.fx = state.fx.filter((f) => f.life > 0);
}

/** Keep the streets full near the player and thin out far away. */
function maintainPopulation(state) {
  const player = state.player;
  // Traffic.
  const near = state.cars.filter((c) => c.driver === 'traffic' && dist(c.x, c.y, player.x, player.y) < 1200).length;
  for (let i = near; i < TRAFFIC.count; i += 1) spawnTrafficCar(state);
  state.cars = state.cars.filter((c) => {
    if (c.missionCar || c.driver === 'player' || c.driver === 'police') return true;
    return dist(c.x, c.y, player.x, player.y) < 1700;
  });
  const parked = state.cars.filter((c) => c.driver === 'parked' && !c.missionCar).length;
  for (let i = parked; i < 6; i += 1) spawnParkedCar(state);
  // Pedestrians.
  const nearPeds = state.peds.filter((p) => dist(p.x, p.y, player.x, player.y) < 900).length;
  for (let i = nearPeds; i < PED.count; i += 1) spawnPed(state);
  state.peds = state.peds.filter((p) => dist(p.x, p.y, player.x, player.y) < 1500);
  // Police, matched to the wanted level.
  const want = policeWanted(state.wanted);
  const policeCars = state.cars.filter((c) => c.driver === 'police' && !c.wrecked);
  for (let i = policeCars.length; i < want.cars; i += 1) spawnPoliceCar(state);
  const footCops = state.peds.filter((p) => p.isCop && p.state !== 'down');
  for (let i = footCops.length; i < want.foot; i += 1) spawnFootCop(state);
  if (state.wanted.stars === 0) {
    // The heat is off: cruisers cruise away as traffic, foot cops walk off.
    for (const car of state.cars) {
      if (car.driver !== 'police' || car.wrecked) continue;
      car.driver = 'traffic';
      const road = nearestRoad(car.x, car.y);
      const dir = state.random.chance(0.5) ? 1 : -1;
      car.route = { axis: road.axis, line: road.line, dir };
    }
    for (const ped of state.peds) {
      if (ped.isCop && ped.state !== 'down') ped.isCop = false;
    }
    state.peds = state.peds.filter((p) => !(p.isCop && p.state === 'down' && dist(p.x, p.y, player.x, player.y) > 900));
  }
}

/** One fixed step of the game. `actions` are the one-shot presses taken this frame. */
export function stepWorld(state, input, actions, dt, audio, renderer) {
  state.time += dt;
  if (state.screen === 'title') {
    // Slow pan over downtown behind the title panel.
    state.cameraX = 1800 + Math.sin(state.time * 0.05) * 600;
    state.cameraY = 1500 + Math.cos(state.time * 0.04) * 400;
    stepAmbient(state, dt);
    return;
  }
  if (state.screen !== 'play') {
    stepAmbient(state, dt);
    return;
  }
  const events = [];
  const player = state.player;
  const cafe = state.city.landmarks.cafe;

  state.nearCafe = !state.missions.active && nearPoint(state, cafe.x, cafe.y, 90);
  if (state.nearCafe && (actions & 8)) {
    const next = nextMissionIndex(state.missions);
    if (next !== -1) {
      const def = startMission(state.missions, state, next);
      setMessage(state, `New mission: ${def.title}`, 4);
      audio.missionDone();
    }
  }

  const steer = input.steer();
  if (player.onFoot) {
    stepPlayerOnFoot(player, steer, input.running(), dt, state.city);
  } else if (player.car) {
    const car = player.car;
    driveCar(car, -steer.y, steer.x, input.running(), dt, state.city, events);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.vx = car.vx;
    player.vy = car.vy;
    player.speed = Math.abs(car.speed);
    // Skid marks while the handbrake is down at speed.
    if (input.running() && Math.abs(car.speed) > 200) {
      const rx = car.x - Math.cos(car.angle) * 28;
      const ry = car.y - Math.sin(car.angle) * 28;
      const px = -Math.sin(car.angle) * 12;
      const py = Math.cos(car.angle) * 12;
      if (state.skidLast) {
        state.skids.push({ x0: state.skidLast.x0, y0: state.skidLast.y0, x1: rx + px, y1: ry + py });
        state.skids.push({ x0: state.skidLast.x1, y0: state.skidLast.y1, x1: rx - px, y1: ry - py });
        if (state.skids.length > 300) state.skids.splice(0, state.skids.length - 300);
      }
      state.skidLast = { x0: rx + px, y0: ry + py, x1: rx - px, y1: ry - py };
    } else {
      state.skidLast = null;
    }
  }

  // Enter or leave a car.
  if (actions & 1) {
    if (player.onFoot) {
      let best = null;
      let bestD = 78;
      for (const car of state.cars) {
        if (car.wrecked) continue;
        const d = dist(player.x, player.y, car.x, car.y);
        if (d < bestD) {
          best = car;
          bestD = d;
        }
      }
      if (best) {
        const wasOccupied = best.driver === 'traffic' || best.driver === 'police';
        player.car = best;
        best.driver = 'player';
        player.onFoot = false;
        player.x = best.x;
        player.y = best.y;
        player.angle = best.angle;
        if (wasOccupied) events.push({ type: EV_CAR_STOLEN, x: best.x, y: best.y });
      }
    } else if (player.car) {
      const car = player.car;
      car.driver = 'parked';
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      player.car = null;
      player.onFoot = true;
      const side = player.angle + Math.PI / 2;
      player.x = car.x + Math.cos(side) * 40;
      player.y = car.y + Math.sin(side) * 40;
      const fixed = resolveCircle(state.city, player.x, player.y, 13);
      player.x = fixed.x;
      player.y = fixed.y;
      player.speed = 0;
    }
  }

  // Punch and shoot.
  if (actions & 2) {
    playerPunch(player, state.peds, state.enemies, events);
    audio.punch();
  }
  if (input.mouseHeld() && player.onFoot && player.weapon === 'pistol') {
    playerShoot(player, state.bullets, input.aim.x, input.aim.y, events);
  }

  // Gang members shoot back.
  for (const e of state.enemies) {
    if (e.health > 0) enemyShoot(e, state.bullets, player, state.city, dt, events);
  }
  stepBullets(state.bullets, dt, state.city, player, state.peds, state.enemies, state.cars, events);

  // Traffic and police.
  for (const car of state.cars) {
    if (car.driver === 'traffic') stepTrafficCar(car, state.cars, dt, state.city, state.random);
    else if (car.driver === 'police') stepPoliceCar(car, player, dt, state.city, events);
    if (car.wrecked && car.smoke < 1) car.smoke = 1;
  }
  collideCars(state.cars, events);
  carsHitPeds(state.cars, state.peds, events);

  // Pedestrians: cops chase the player while wanted, everyone else strolls or flees.
  const danger = (state.time - state.lastShot < 2 || (!player.onFoot && Math.abs(player.speed) > 250))
    ? { x: player.x, y: player.y }
    : null;
  for (const ped of state.peds) {
    if (ped.isCop && state.wanted.stars > 0 && ped.state !== 'down') {
      const angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      ped.angle = angle;
      ped.x += Math.cos(angle) * 205 * dt;
      ped.y += Math.sin(angle) * 205 * dt;
      const fixed = resolveCircle(state.city, ped.x, ped.y, 11);
      ped.x = fixed.x;
      ped.y = fixed.y;
      continue;
    }
    stepPed(ped, dt, state.city, state.random, ped.isCop ? null : danger);
  }

  // Missions, taxi fares, packages.
  updateMissions(state.missions, state, dt, events);
  updateTaxi(state.missions, state, dt, events);
  checkPackages(state.missions, state, events);

  // A wrecked mission car fails the mission.
  if (state.missions.active) {
    const step = state.missions.steps[state.missions.stepIndex];
    if (step && (step.kind === 'steal' || step.kind === 'deliver') && step.carId) {
      const car = state.cars.find((c) => c.missionCar === step.carId);
      if (car && car.wrecked) {
        failMission(state.missions, state, events);
        setMessage(state, 'The mission car is wrecked', 4);
      }
    }
  }

  // Wanted: decay, bust, wasted.
  stepWanted(state.wanted, player, state.cars, state.peds, dt, state.time, events);

  maintainPopulation(state);

  // Effects age.
  for (const f of state.fx) {
    f.life -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  state.fx = state.fx.filter((f) => f.life > 0);
  if (state.message) {
    state.message.timer -= dt;
    if (state.message.timer <= 0) state.message = null;
  }
  if (state.damageFlash > 0) state.damageFlash -= dt;
  if (player.car && player.car.wrecked) {
    // Ejected from a wrecked car.
    const car = player.car;
    player.car = null;
    player.onFoot = true;
    player.health -= 15;
    player.invuln = 1;
    state.damageFlash = 1;
    setMessage(state, 'Your car is wrecked!', 3);
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * 40;
    player.y = car.y + Math.sin(side) * 40;
    const fixed = resolveCircle(state.city, player.x, player.y, 13);
    player.x = fixed.x;
    player.y = fixed.y;
    player.speed = 0;
  }
  if (player.health < 0) player.health = 0;
  state.bestCash = Math.max(state.bestCash, player.cash);

  // Sounds.
  audio.engine(player.onFoot ? null : Math.abs(player.car ? player.car.speed : 0) / 720, dt);
  audio.siren(state.wanted.stars > 0, dt);

  handleEvents(state, events, audio, renderer);
}

/** Wake up after being busted or wasted: hospital or station, health back, mission retry. */
export function respawn(state) {
  const player = state.player;
  const wasBusted = state.screen === 'busted';
  const spot = wasBusted ? state.city.landmarks.policeStation : state.city.landmarks.hospital;
  player.x = spot.x;
  player.y = spot.y;
  player.angle = -Math.PI / 2;
  player.vx = 0;
  player.vy = 0;
  player.speed = 0;
  player.health = 100;
  player.onFoot = true;
  player.car = null;
  player.invuln = 2;
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bustTimer = 0;
  state.enemies = [];
  state.screen = 'play';
  state.screenData = {};
  if (state.failedMission >= 0) {
    const index = state.failedMission;
    state.failedMission = -1;
    startMission(state.missions, state, index);
    setMessage(state, `Try again: ${state.missions.defs[index].title}`, 4);
  }
  writeSave(state);
}
