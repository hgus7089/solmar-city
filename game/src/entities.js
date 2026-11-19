// The moving things: the player (on foot or driving), traffic cars, police and
// pedestrians, with arcade car physics and simple road-following AI. No drawing here;
// the world asks these to move and reports what happened as events.

import { CAR, CITY, MODELS, PED, PLAYER, TRAFFIC } from './config.js';
import { hitsBuilding, nearestRoad, onRoad, randomRoadPoint, randomSidewalkPoint, resolveCircle } from './city.js';

export const EV_CRASH = 'crash';
export const EV_PED_HIT = 'pedHit';
export const EV_CAR_STOLEN = 'carStolen';
export const EV_CAR_WRECKED = 'carWrecked';

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDiff(target, current) {
  return wrapAngle(target - current);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    health: PLAYER.health, cash: PLAYER.startCash,
    onFoot: true, car: null, weapon: 'fists', ammo: 0,
    punchTimer: 0, shootTimer: 0, invuln: 0,
    speed: 0, // current movement speed, for the HUD and the camera
  };
}

export function createCar(random, x, y, angle, modelIndex, driver) {
  const model = MODELS[modelIndex % MODELS.length];
  return {
    x, y, angle, vx: 0, vy: 0, speed: 0,
    model: modelIndex % MODELS.length, modelName: model.name,
    top: model.top, accel: model.accel, color: model.color,
    health: CAR.health, driver, // 'traffic' | 'police' | 'player' | 'parked' | null
    route: null, stopped: false, smoke: 0, wrecked: false,
    steerVisual: 0,
  };
}

export function createPed(random, x, y, isCop) {
  const shirts = ['#c94f4f', '#4f7ec9', '#58a86b', '#c9a44f', '#8a5fc9', '#c97e4f', '#4fc9b8'];
  return {
    x, y, angle: random.range(0, Math.PI * 2),
    tx: x, ty: y, speed: 0,
    state: 'walk', // walk | flee | down | cop
    timer: 0, color: random.pick(shirts),
    isCop: !!isCop, down: false, driverOf: null,
  };
}

/** Put a traffic car on a road with a route to follow. */
export function placeOnRoad(car, city, random) {
  const p = randomRoadPoint(city, random);
  const road = nearestRoad(p.x, p.y);
  car.x = p.x;
  car.y = p.y;
  if (road.axis === 'x') {
    car.angle = random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    car.route = { axis: 'x', line: road.line, dir: car.angle > 0 ? 1 : -1 };
  } else {
    car.angle = random.chance(0.5) ? 0 : Math.PI;
    car.route = { axis: 'y', line: road.line, dir: car.angle === 0 ? 1 : -1 };
  }
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  return car;
}

/** Right-hand lane offset for a route: cars keep right, like real traffic. */
function laneOffset(route) {
  if (route.axis === 'x') return route.dir === 1 ? -26 : 26;
  return route.dir === 1 ? 26 : -26;
}

function carAhead(cars, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nearest = Infinity;
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > range || d < 1) continue;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < range && side < 34 && d < nearest) nearest = d;
  }
  return nearest;
}

/** Arcade driving: throttle -1..1, steer -1..1, handbrake bool. Returns impact events. */
export function driveCar(car, throttle, steer, handbrake, dt, city, events) {
  if (car.wrecked) {
    car.speed *= Math.max(0, 1 - 2 * dt);
    car.vx *= Math.max(0, 1 - 2 * dt);
    car.vy *= Math.max(0, 1 - 2 * dt);
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    return;
  }
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  let forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let lateralX = car.vx - forwardX * forwardSpeed;
  let lateralY = car.vy - forwardY * forwardSpeed;

  if (throttle > 0) forwardSpeed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (forwardSpeed > 30) forwardSpeed += CAR.brake * throttle * dt;
    else forwardSpeed += CAR.reverseAccel * throttle * dt;
  } else {
    forwardSpeed -= Math.sign(forwardSpeed) * Math.min(Math.abs(forwardSpeed), 260 * dt);
  }
  forwardSpeed = Math.max(-CAR.maxReverse, Math.min(car.top, forwardSpeed));

  const speedFactor = Math.max(-1, Math.min(1, forwardSpeed / 320));
  car.angle += steer * CAR.steer * speedFactor * dt * (forwardSpeed < 0 ? -1 : 1);
  car.steerVisual = steer;

  const grip = handbrake ? CAR.driftGrip : CAR.grip;
  const decay = Math.exp(-grip * dt);
  lateralX *= decay;
  lateralY *= decay;
  if (handbrake) forwardSpeed *= Math.max(0, 1 - 0.8 * dt);

  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  car.vx = nx * forwardSpeed + lateralX;
  car.vy = ny * forwardSpeed + lateralY;
  car.speed = forwardSpeed;

  const oldX = car.x;
  const oldY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const fixed = resolveCircle(city, car.x, car.y, 24);
  if (fixed.x !== car.x || fixed.y !== car.y) {
    const impact = Math.abs(forwardSpeed);
    car.x = fixed.x;
    car.y = fixed.y;
    // Slide along the wall: keep the velocity component that runs parallel to it.
    const hit = hitsBuilding(city, oldX + car.vx * dt, oldY + car.vy * dt, 24);
    if (hit && !hit.water) {
      const pushX = fixed.x - (oldX + car.vx * dt);
      const pushY = fixed.y - (oldY + car.vy * dt);
      const len = Math.hypot(pushX, pushY) || 1;
      const px = pushX / len;
      const py = pushY / len;
      const into = car.vx * px + car.vy * py;
      if (into < 0) {
        car.vx -= px * into;
        car.vy -= py * into;
      }
    }
    if (impact > 240) {
      car.health -= (impact - 240) / 14;
      events.push({ type: EV_CRASH, x: car.x, y: car.y, strength: Math.min(1, impact / 620) });
      if (car.health <= 0 && !car.wrecked) {
        car.wrecked = true;
        events.push({ type: EV_CAR_WRECKED, x: car.x, y: car.y });
      }
    }
    car.speed *= 0.6;
  }
  if (car.health < 35) car.smoke = 1;
  else if (car.health < 70) car.smoke = 0.5;
  else car.smoke = 0;
}

/** Traffic AI: follow the route's lane, turn at intersections, stop for the car ahead. */
export function stepTrafficCar(car, cars, dt, city, random) {
  if (car.wrecked || !car.route) return;
  const route = car.route;
  const lane = laneOffset(route);
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
  const steer = Math.max(-1, Math.min(1, angleDiff(desired, car.angle) * 2.2));
  const ahead = carAhead(cars, car, TRAFFIC.minGap + 40);
  let throttle = 0.55;
  if (ahead < TRAFFIC.minGap) throttle = -0.6;
  else if (ahead < TRAFFIC.minGap + 50) throttle = 0.2;
  driveCar(car, throttle, steer, false, dt, city, []);
  // At an intersection, sometimes turn onto the crossing road.
  const road = nearestRoad(car.x, car.y);
  const onCrossing = route.axis === 'x'
    ? Math.abs(car.y - road.line) < 46 && road.axis === 'y'
    : Math.abs(car.x - road.line) < 46 && road.axis === 'x';
  if (onCrossing && random.chance(dt * 0.5)) {
    const cross = nearestRoad(car.x, car.y);
    const dir = random.chance(0.5) ? 1 : -1;
    car.route = { axis: cross.axis, line: cross.line, dir };
  }
  // Reached the end of a road: turn around onto the nearest crossing road.
  const outOfRoad = route.axis === 'x'
    ? car.y < 230 || car.y > 2470
    : car.x < 230 || car.x > CITY.width - 230;
  if (outOfRoad) {
    const cross = nearestRoad(car.x, car.y);
    car.route = { axis: cross.axis, line: cross.line, dir: random.chance(0.5) ? 1 : -1 };
  }
}

/** Police cruiser AI: chase the player, ramming their car or stopping beside them on foot. */
export function stepPoliceCar(car, player, dt, city, events) {
  if (car.wrecked) {
    driveCar(car, 0, 0, false, dt, city, events);
    return;
  }
  const lookX = player.x + player.vx * 0.35;
  const lookY = player.y + player.vy * 0.35;
  const desired = Math.atan2(lookY - car.y, lookX - car.x);
  const steer = Math.max(-1, Math.min(1, angleDiff(desired, car.angle) * 2.4));
  const d = dist(car.x, car.y, player.x, player.y);
  let throttle = 1;
  if (!player.onFoot && d < 70) throttle = 0.4; // ram, don't overshoot wildly
  if (player.onFoot && d < 110) throttle = 0.15; // pull up beside them
  driveCar(car, throttle, steer, false, dt, city, events);
}

/** Pedestrian AI: stroll the sidewalks, flee danger, lie down when hit. */
export function stepPed(ped, dt, city, random, danger) {
  if (ped.state === 'down') {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.state = 'flee';
      ped.timer = 2.5;
    }
    return;
  }
  if (danger) {
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy);
    if (d < 260) {
      ped.state = 'flee';
      ped.timer = 2.2;
    }
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const away = danger ? Math.atan2(ped.y - danger.y, ped.x - danger.x) : ped.angle;
    ped.angle = away;
    const speed = ped.isCop ? 205 : PED.fleeSpeed;
    ped.x += Math.cos(away) * speed * dt;
    ped.y += Math.sin(away) * speed * dt;
    const fixed = resolveCircle(city, ped.x, ped.y, PED.radius);
    ped.x = fixed.x;
    ped.y = fixed.y;
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  // Walk: head for the current sidewalk target, pick a new one on arrival.
  const dx = ped.tx - ped.x;
  const dy = ped.ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 24) {
    const p = randomSidewalkPoint(city, random);
    ped.tx = p.x;
    ped.ty = p.y;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  const speed = ped.isCop ? 205 : PED.walkSpeed;
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  const fixed = resolveCircle(city, ped.x, ped.y, PED.radius);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

/** Move the player on foot: WASD, run with Shift, blocked by buildings and water. */
export function stepPlayerOnFoot(player, steer, running, dt, city) {
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = steer.x;
  let my = steer.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    player.angle = Math.atan2(my, mx);
  }
  player.vx = mx * speed;
  player.vy = my * speed;
  player.speed = len > 0 ? speed : 0;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  const fixed = resolveCircle(city, player.x, player.y, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.shootTimer > 0) player.shootTimer -= dt;
}

/** Circle collisions between cars: push apart, trade speed, damage both. */
export function collideCars(cars, events) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 46;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
      if (rel > 120) {
        const dmg = (rel - 120) / 16;
        a.health -= dmg;
        b.health -= dmg;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        events.push({ type: EV_CRASH, x: mx, y: my, strength: Math.min(1, rel / 600) });
        for (const car of [a, b]) {
          if (car.health <= 0 && !car.wrecked) {
            car.wrecked = true;
            events.push({ type: EV_CAR_WRECKED, x: car.x, y: car.y });
          }
        }
      }
      // Trade a little speed along the impact normal.
      const avn = a.vx * nx + a.vy * ny;
      const bvn = b.vx * nx + b.vy * ny;
      const exchange = (avn - bvn) * 0.4;
      a.vx -= nx * exchange;
      a.vy -= ny * exchange;
      b.vx += nx * exchange;
      b.vy += ny * exchange;
    }
  }
}

/** Cars running over pedestrians: the ped goes down, the car slows a touch. */
export function carsHitPeds(cars, peds, events) {
  for (const car of cars) {
    if (car.wrecked) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 60) continue;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = dist(car.x, car.y, ped.x, ped.y);
      if (d < 30) {
        ped.state = 'down';
        ped.timer = 5;
        ped.x += Math.cos(car.angle) * 26;
        ped.y += Math.sin(car.angle) * 26;
        car.speed *= 0.85;
        car.vx *= 0.85;
        car.vy *= 0.85;
        events.push({ type: EV_PED_HIT, x: ped.x, y: ped.y, byPlayer: car.driver === 'player', speed });
      }
    }
  }
}
