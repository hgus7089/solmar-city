// Combat: fists and the pistol, bullets, and damage. Bullets are plain objects in a
// pool; the world owns the pool and hands it here each step. Nothing here draws.

import { PLAYER } from './config.js';
import { wrapAngle } from './entities.js';
import { hitsBuilding } from './city.js';

export const EV_SHOT_FIRED = 'shotFired';
export const EV_PED_DOWN = 'pedDown';
export const EV_COP_DOWN = 'copDown';
export const EV_ENEMY_DOWN = 'enemyDown';
export const EV_PLAYER_HIT = 'playerHit';

const BULLET_SPEED = 900;
const BULLET_POOL = 48;

export function createBullets() {
  const pool = [];
  for (let i = 0; i < BULLET_POOL; i += 1) {
    pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, from: '', damage: 0 });
  }
  return pool;
}

function fire(pool, x, y, angle, from, damage) {
  for (const b of pool) {
    if (b.active) continue;
    b.active = true;
    b.x = x + Math.cos(angle) * 22;
    b.y = y + Math.sin(angle) * 22;
    b.vx = Math.cos(angle) * BULLET_SPEED;
    b.vy = Math.sin(angle) * BULLET_SPEED;
    b.life = PLAYER.pistolRange / BULLET_SPEED;
    b.from = from;
    b.damage = damage;
    return true;
  }
  return false;
}

/** The player shoots toward the aim point. Returns true when a shot left the barrel. */
export function playerShoot(player, pool, aimX, aimY, events) {
  if (player.shootTimer > 0 || player.weapon !== 'pistol') return false;
  if (player.ammo <= 0) {
    player.shootTimer = 0.3;
    return false;
  }
  const angle = Math.atan2(aimY - player.y, aimX - player.x);
  player.angle = angle;
  if (fire(pool, player.x, player.y, angle, 'player', PLAYER.pistolDamage)) {
    player.ammo -= 1;
    player.shootTimer = PLAYER.pistolRate;
    events.push({ type: EV_SHOT_FIRED, x: player.x, y: player.y, angle });
    return true;
  }
  return false;
}

/** The player punches whatever is in front of them. Returns the ped hit, if any. */
export function playerPunch(player, peds, enemies, events) {
  if (player.punchTimer > 0) return null;
  player.punchTimer = PLAYER.punchRate;
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 34) {
      hurtPed(ped, PLAYER.punchDamage, events);
      return ped;
    }
  }
  for (const e of enemies) {
    if (e.health <= 0) continue;
    if (Math.hypot(e.x - px, e.y - py) < 36) {
      e.health -= PLAYER.punchDamage;
      if (e.health <= 0) events.push({ type: EV_ENEMY_DOWN, x: e.x, y: e.y });
      return e;
    }
  }
  return null;
}

/** An enemy (gang member) shoots at the player when they have line of sight. */
export function enemyShoot(enemy, pool, player, city, dt, events) {
  enemy.shootTimer -= dt;
  const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (d > 560 || enemy.shootTimer > 0 || enemy.health <= 0) return;
  if (blockedByBuilding(city, enemy.x, enemy.y, player.x, player.y)) return;
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + (Math.random() - 0.5) * 0.22;
  enemy.angle = angle;
  if (fire(pool, enemy.x, enemy.y, angle, 'enemy', 12)) {
    enemy.shootTimer = 0.85 + Math.random() * 0.5;
    events.push({ type: EV_SHOT_FIRED, x: enemy.x, y: enemy.y, angle });
  }
}

function blockedByBuilding(city, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24);
  for (let i = 1; i < steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (hitsBuilding(city, x, y, 4)) return true;
  }
  return false;
}

/** Move bullets and resolve hits against peds, enemies, cars and the player. */
export function stepBullets(pool, dt, city, player, peds, enemies, cars, events) {
  for (const b of pool) {
    if (!b.active) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && hitsBuilding(city, b.x, b.y, 2)) dead = true;
    if (!dead && b.from !== 'player') {
      const d = Math.hypot(player.x - b.x, player.y - b.y);
      if (d < 16 && player.invuln === 0) {
        player.health -= b.damage;
        player.invuln = 0.6;
        events.push({ type: EV_PLAYER_HIT, x: player.x, y: player.y });
        dead = true;
      }
    }
    if (!dead) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
          if (b.from === 'player') hurtPed(ped, b.damage, events);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const e of enemies) {
        if (e.health <= 0) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 16) {
          if (b.from === 'player') {
            e.health -= b.damage;
            if (e.health <= 0) events.push({ type: EV_ENEMY_DOWN, x: e.x, y: e.y });
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of cars) {
        if (car.wrecked) continue;
        const dx = car.x - b.x;
        const dy = car.y - b.y;
        const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
        const side = Math.abs(dx * -Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (along < 34 && side < 18) {
          car.health -= b.damage * 0.4;
          if (car.health <= 0) car.wrecked = true;
          dead = true;
          break;
        }
      }
    }
    if (dead) b.active = false;
  }
}

function hurtPed(ped, damage, events) {
  ped.state = 'down';
  ped.timer = 6;
  if (ped.isCop) events.push({ type: EV_COP_DOWN, x: ped.x, y: ped.y });
  else events.push({ type: EV_PED_DOWN, x: ped.x, y: ped.y });
}

export function playerHealthFraction(player) {
  return Math.max(0, player.health) / PLAYER.health;
}

export function enemyAngleTo(enemy, x, y) {
  return wrapAngle(Math.atan2(y - enemy.y, x - enemy.x) - enemy.angle);
}
