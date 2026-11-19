// The story and the side work. Six missions for Rosa Delgado, from a first errand to
// the big score, plus taxi fares and ten hidden packages for free roam. A mission is a
// list of steps; each step is checked here every frame and advances the story. The
// world owns the state; this module only reads it and writes mission progress.

import { MISSION_REWARDS } from './config.js';
import { randomRoadPoint } from './city.js';
import { createCar, createPed } from './entities.js';
import { addHeat } from './wanted.js';

export const EV_MISSION_STEP = 'missionStep';
export const EV_MISSION_DONE = 'missionDone';
export const EV_MISSION_FAIL = 'missionFail';
export const EV_FARE_DONE = 'fareDone';
export const EV_PACKAGE = 'package';

const MISSION_DEFS = [
  {
    id: 'welcome',
    title: 'Welcome to Solmar',
    giver: 'Rosa Delgado',
    brief: 'You just rolled into Solmar City, Vic. Come see me at Café Solmar, by the tower. Walk or grab a car — nobody here will mind.',
    reward: MISSION_REWARDS[0],
  },
  {
    id: 'hotwheels',
    title: 'Hot Wheels',
    giver: 'Rosa Delgado',
    brief: 'A Comet GT is parked downtown, keys in it, owner in a meeting. Bring it to my garage. Try not to scratch it. The cops will notice — drive clean.',
    reward: MISSION_REWARDS[1],
  },
  {
    id: 'payday',
    title: 'Payday',
    giver: 'Rosa Delgado',
    brief: 'Three shops owe me. Drive round, collect the envelopes, bring them back. Stand at each door a moment — they pay slow, like everyone in this town.',
    reward: MISSION_REWARDS[2],
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    giver: 'Rosa Delgado',
    brief: 'Pick up the parcel at the docks. The police are already on their way — lose them. Break line of sight, stay out of trouble, and the heat dies down.',
    reward: MISSION_REWARDS[3],
  },
  {
    id: 'docks',
    title: 'Dockside Rumble',
    giver: 'Rosa Delgado',
    brief: 'The Marinos think the docks are theirs. They are wrong. Take your pistol, clear them out, and come back in one piece. Ammo is on me.',
    reward: MISSION_REWARDS[4],
  },
  {
    id: 'bigscore',
    title: 'The Big Score',
    giver: 'Rosa Delgado',
    brief: 'An armored van leaves the bank at noon. Take it, lose the cops, and bring it to the hideout. Do this right and you will never work a small job again.',
    reward: MISSION_REWARDS[5],
  },
];

function stepGoto(x, y, label, radius) {
  return { kind: 'goto', x, y, label, radius: radius || 70 };
}

function stepSteal(carId, label) {
  return { kind: 'steal', carId, label };
}

function stepDeliver(x, y, label, carId) {
  return { kind: 'deliver', x, y, label, carId: carId || null, radius: 80 };
}

function stepCollect(points, label) {
  return { kind: 'collect', points: points.map((p) => ({ ...p, done: false })), label };
}

function stepSurvive(label) {
  return { kind: 'survive', label };
}

function stepEliminate(label) {
  return { kind: 'eliminate', label };
}

export function createMissions(city, random) {
  const packages = [];
  for (let i = 0; i < 10; i += 1) {
    // Packages hide along the roads, where the player can always reach them.
    const p = randomRoadPoint(city, random);
    packages.push({ x: p.x, y: p.y, taken: false });
  }
  return {
    defs: MISSION_DEFS,
    activeIndex: -1,
    active: null,
    stepIndex: 0,
    steps: [],
    done: [],
    packages,
    taxi: { active: false, phase: '', ped: null, x: 0, y: 0, timer: 0, fare: 0, cooldown: 8 },
  };
}

export function missionCount(missions) {
  return missions.defs.length;
}

export function nextMissionIndex(missions) {
  for (let i = 0; i < missions.defs.length; i += 1) {
    if (!missions.done.includes(i)) return i;
  }
  return -1;
}

function buildSteps(index, state) {
  const L = state.city.landmarks;
  if (index === 0) {
    return [stepGoto(L.cafe.x, L.cafe.y, 'Go to Café Solmar')];
  }
  if (index === 1) {
    const car = createCar(state.random, 1800, 1180, Math.PI / 2, 0, 'parked');
    car.missionCar = 'comet';
    state.cars.push(car);
    return [
      stepSteal('comet', 'Steal the Comet GT downtown'),
      stepDeliver(L.garage.x, L.garage.y, 'Deliver the Comet to Rosa\u2019s Garage', 'comet'),
    ];
  }
  if (index === 2) {
    return [
      stepCollect([
        { x: 1020, y: 620, label: 'Corner Store' },
        { x: 2620, y: 1420, label: 'Laundromat' },
        { x: 620, y: 1820, label: 'Pawn Shop' },
      ], 'Collect the three envelopes'),
      stepDeliver(L.cafe.x, L.cafe.y, 'Bring the envelopes to Rosa'),
    ];
  }
  if (index === 3) {
    return [
      stepGoto(L.docks.x, L.docks.y, 'Pick up the parcel at the docks'),
      stepSurvive('Lose the police — stay out of sight until the heat dies down'),
    ];
  }
  if (index === 4) {
    const spots = [
      { x: 3050, y: 2200 }, { x: 3220, y: 2200 },
      { x: 3000, y: 2300 }, { x: 3350, y: 2200 },
    ];
    for (const s of spots) {
      state.enemies.push({
        x: s.x, y: s.y, angle: 0, health: 100, shootTimer: 1 + state.random.range(0, 1),
      });
    }
    return [stepEliminate('Clear out the Marinos at the docks')];
  }
  if (index === 5) {
    const van = createCar(state.random, 2200, 1180, 0, 6, 'parked');
    van.missionCar = 'van';
    state.cars.push(van);
    return [
      stepSteal('van', 'Take the armored van by the bank'),
      stepDeliver(L.hideout.x, L.hideout.y, 'Lose the cops and deliver the van to the hideout', 'van'),
    ];
  }
  return [];
}

export function startMission(missions, state, index) {
  const def = missions.defs[index];
  missions.activeIndex = index;
  missions.stepIndex = 0;
  missions.steps = buildSteps(index, state);
  missions.active = def;
  state.failedMission = -1;
  if (index === 3) {
    // The pickup is hot: the police are already rolling.
  }
  if (index === 4) {
    state.player.weapon = 'pistol';
    state.player.ammo = Math.max(state.player.ammo, 60);
  }
  return def;
}

export function currentObjective(missions) {
  if (!missions.active) return 'Free roam — press Enter at the café to start a mission.';
  const step = missions.steps[missions.stepIndex];
  if (!step) return missions.active.title;
  return `${missions.active.title}: ${step.label}`;
}

export function currentMarker(missions, state) {
  if (!missions.active) {
    if (missions.taxi.active) return { x: missions.taxi.x, y: missions.taxi.y, label: missions.taxi.phase === 'pickup' ? 'Taxi pickup' : 'Taxi drop-off', kind: 'taxi' };
    return null;
  }
  const step = missions.steps[missions.stepIndex];
  if (!step) return null;
  if (step.kind === 'goto' || step.kind === 'deliver') return { x: step.x, y: step.y, label: step.label, kind: 'mission' };
  if (step.kind === 'steal') {
    const car = state.cars.find((c) => c.missionCar === step.carId);
    if (car) return { x: car.x, y: car.y, label: step.label, kind: 'mission' };
    return null;
  }
  if (step.kind === 'collect') {
    const next = step.points.find((p) => !p.done);
    if (next) return { x: next.x, y: next.y, label: next.label || step.label, kind: 'mission' };
    const deliver = missions.steps[missions.stepIndex + 1];
    if (deliver) return { x: deliver.x, y: deliver.y, label: deliver.label, kind: 'mission' };
    return null;
  }
  if (step.kind === 'survive') return null;
  if (step.kind === 'eliminate') {
    const alive = state.enemies.find((e) => e.health > 0);
    if (alive) return { x: alive.x, y: alive.y, label: `${state.enemies.filter((e) => e.health > 0).length} left`, kind: 'enemy' };
    return null;
  }
  return null;
}

function advanceStep(missions, state, events) {
  missions.stepIndex += 1;
  events.push({ type: EV_MISSION_STEP, title: missions.active.title });
  if (missions.stepIndex >= missions.steps.length) {
    const def = missions.active;
    missions.done.push(missions.activeIndex);
    state.player.cash += def.reward;
    missions.active = null;
    missions.activeIndex = -1;
    missions.steps = [];
    missions.stepIndex = 0;
    events.push({ type: EV_MISSION_DONE, title: def.title, reward: def.reward });
  }
}

function near(x, y, tx, ty, radius) {
  return Math.hypot(x - tx, y - ty) < radius;
}

export function updateMissions(missions, state, dt, events) {
  const player = state.player;
  if (!missions.active) return;
  const step = missions.steps[missions.stepIndex];
  if (!step) return;
  if (step.kind === 'goto') {
    if (near(player.x, player.y, step.x, step.y, step.radius)) {
      if (missions.activeIndex === 3 && missions.stepIndex === 0) {
        addHeat(state.wanted, 45, state.time, events);
      }
      advanceStep(missions, state, events);
    }
  } else if (step.kind === 'steal') {
    if (!player.onFoot && player.car && player.car.missionCar === step.carId) {
      advanceStep(missions, state, events);
      if (missions.activeIndex === 5) {
        addHeat(state.wanted, 60, state.time, events);
      }
    }
  } else if (step.kind === 'deliver') {
    const inRightCar = !step.carId || (player.car && player.car.missionCar === step.carId);
    if (inRightCar && near(player.x, player.y, step.x, step.y, step.radius)) {
      advanceStep(missions, state, events);
    }
  } else if (step.kind === 'collect') {
    let allDone = true;
    for (const p of step.points) {
      if (!p.done && near(player.x, player.y, p.x, p.y, 56)) {
        p.done = true;
        p.dwell = 0;
      }
      if (!p.done) allDone = false;
    }
    if (allDone) advanceStep(missions, state, events);
  } else if (step.kind === 'survive') {
    if (state.wanted.stars === 0) advanceStep(missions, state, events);
  } else if (step.kind === 'eliminate') {
    if (state.enemies.every((e) => e.health <= 0)) advanceStep(missions, state, events);
  }
}

/** A mission failed (busted or wasted): reset it to its start, keep the story. */
export function failMission(missions, state, events) {
  if (!missions.active) return;
  const index = missions.activeIndex;
  // Clear mission cars and enemies so the retry starts clean.
  state.cars = state.cars.filter((c) => !c.missionCar);
  state.enemies = [];
  missions.active = null;
  missions.activeIndex = -1;
  missions.steps = [];
  missions.stepIndex = 0;
  state.failedMission = index;
  events.push({ type: EV_MISSION_FAIL, title: MISSION_DEFS[index].title });
}

/** Taxi fares for free roam: hail a cab, drop the fare, get paid. */
export function updateTaxi(missions, state, dt, events) {
  const taxi = missions.taxi;
  const player = state.player;
  if (missions.active) {
    taxi.active = false;
    return;
  }
  if (!taxi.active) {
    taxi.cooldown -= dt;
    if (taxi.cooldown > 0 || player.onFoot) return;
    // A fare appears near the player's car.
    const ped = createPed(state.random, player.x + 160, player.y + 40, false);
    state.peds.push(ped);
    taxi.ped = ped;
    taxi.x = ped.x;
    taxi.y = ped.y;
    taxi.phase = 'pickup';
    taxi.active = true;
    state.message = { text: 'Taxi fare nearby — pick them up', timer: 4 };
    return;
  }
  if (taxi.phase === 'pickup') {
    if (taxi.ped.state === 'down') {
      taxi.active = false;
      taxi.cooldown = 20;
      return;
    }
    if (near(player.x, player.y, taxi.ped.x, taxi.ped.y, 60) && !player.onFoot) {
      // The fare gets in: take them out of the walking crowd.
      const at = state.peds.indexOf(taxi.ped);
      if (at !== -1) state.peds.splice(at, 1);
      taxi.ped = null;
      const dest = randomRoadPoint(state.city, state.random);
      taxi.x = dest.x;
      taxi.y = dest.y;
      taxi.phase = 'dropoff';
      taxi.fare = 80 + state.random.int(0, 7) * 10;
      taxi.timer = 75;
      state.message = { text: `Fare: ${taxi.fare} — get there in time`, timer: 4 };
    }
  } else {
    taxi.timer -= dt;
    if (near(player.x, player.y, taxi.x, taxi.y, 70)) {
      player.cash += taxi.fare;
      events.push({ type: EV_FARE_DONE, fare: taxi.fare });
      taxi.active = false;
      taxi.cooldown = 18;
      return;
    }
    if (taxi.timer <= 0 || player.onFoot) {
      taxi.active = false;
      taxi.cooldown = 18;
    }
  }
}

/** Walk or drive over a hidden package: +$100. */
export function checkPackages(missions, state, events) {
  const player = state.player;
  for (const p of missions.packages) {
    if (p.taken) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) < 40) {
      p.taken = true;
      player.cash += 100;
      events.push({ type: EV_PACKAGE, x: p.x, y: p.y });
    }
  }
}
