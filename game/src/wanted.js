// The wanted system: heat from crimes, stars from heat, police dispatched to match,
// and the bust. Heat decays when the player is calm and out of sight; being seen by the
// police holds it. Getting busted or wasted clears it at a price.

import { POLICE, WANTED } from './config.js';

export const EV_WANTED_UP = 'wantedUp';
export const EV_WANTED_CLEAR = 'wantedClear';
export const EV_BUSTED = 'busted';
export const EV_WASTED = 'wasted';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    lastCrime: -100,
    bustTimer: 0,
    seen: false,
  };
}

export function addHeat(wanted, amount, now, events) {
  const before = wanted.stars;
  wanted.heat = Math.min(WANTED.maxHeat, wanted.heat + amount);
  wanted.lastCrime = now;
  wanted.stars = Math.min(5, Math.floor(wanted.heat / WANTED.starHeat));
  if (wanted.stars > before) {
    events.push({ type: EV_WANTED_UP, stars: wanted.stars });
  }
}

/** How many police cars and foot cops the current stars field. */
export function policeWanted(wanted) {
  const stars = wanted.stars;
  return {
    cars: POLICE.carsPerStar[stars] || 0,
    foot: POLICE.footPerStar[stars] || 0,
  };
}

/** Is any police close enough to see the player right now? */
export function policeCanSee(player, cars, peds) {
  for (const car of cars) {
    if (car.driver !== 'police' || car.wrecked) continue;
    if (Math.hypot(car.x - player.x, car.y - player.y) < 420) return true;
  }
  for (const ped of peds) {
    if (!ped.isCop || ped.state === 'down') continue;
    if (Math.hypot(ped.x - player.x, ped.y - player.y) < 300) return true;
  }
  return false;
}

/**
 * One step: decay heat, and check the bust. A foot cop close to a slow player on foot,
 * for POLICE.bustSeconds, busts them. Returns 'busted' | 'wasted' | null.
 */
export function stepWanted(wanted, player, cars, peds, dt, now, events) {
  if (player.health <= 0) {
    events.push({ type: EV_WASTED });
    wanted.heat = 0;
    wanted.stars = 0;
    return 'wasted';
  }
  const seen = policeCanSee(player, cars, peds);
  wanted.seen = seen;
  const calm = now - wanted.lastCrime > 4;
  if (wanted.heat > 0 && calm) {
    const rate = seen ? WANTED.decay : WANTED.decayHidden;
    const before = wanted.stars;
    wanted.heat = Math.max(0, wanted.heat - rate * dt);
    wanted.stars = Math.min(5, Math.floor(wanted.heat / WANTED.starHeat));
    if (wanted.stars === 0 && before > 0) {
      events.push({ type: EV_WANTED_CLEAR });
    }
  }
  // Bust: a foot cop right next to a slow player on foot.
  if (wanted.stars > 0 && player.onFoot && player.speed < POLICE.bustSpeed) {
    let near = false;
    for (const ped of peds) {
      if (!ped.isCop || ped.state === 'down') continue;
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < POLICE.bustRange) {
        near = true;
        break;
      }
    }
    if (near) {
      wanted.bustTimer += dt;
      if (wanted.bustTimer >= POLICE.bustSeconds) {
        events.push({ type: EV_BUSTED });
        wanted.heat = 0;
        wanted.stars = 0;
        wanted.bustTimer = 0;
        return 'busted';
      }
    } else {
      wanted.bustTimer = 0;
    }
  } else {
    wanted.bustTimer = 0;
  }
  return null;
}
