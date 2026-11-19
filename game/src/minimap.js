// The minimap: the whole city shrunk into a corner of the HUD — roads, water, the
// player arrow, the mission marker, police blips and taxi fares. Drawn by the renderer
// onto the same canvas, in the same pass as the HUD.

import { CITY } from './config.js';

const MAP_W = 208;
const MAP_H = 162;

/** Where the minimap sits on the 1280x720 view. */
export const MAP_RECT = { x: 16, y: 720 - MAP_H - 16, w: MAP_W, h: MAP_H };

function toMap(x, y) {
  return {
    x: MAP_RECT.x + (x / CITY.width) * MAP_W,
    y: MAP_RECT.y + (y / CITY.height) * MAP_H,
  };
}

export function drawMinimap(ctx, state, marker) {
  const city = state.city;
  ctx.save();
  // Panel.
  ctx.fillStyle = 'rgba(16, 14, 11, 0.85)';
  ctx.fillRect(MAP_RECT.x - 4, MAP_RECT.y - 4, MAP_W + 8, MAP_H + 8);
  ctx.strokeStyle = '#f2c94c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MAP_RECT.x - 4, MAP_RECT.y - 4, MAP_W + 8, MAP_H + 8);
  // Water and beach along the south edge.
  ctx.fillStyle = '#256b8f';
  ctx.fillRect(MAP_RECT.x, MAP_RECT.y + (CITY.waterY / CITY.height) * MAP_H, MAP_W, MAP_H - (CITY.waterY / CITY.height) * MAP_H);
  ctx.fillStyle = '#e3c98f';
  ctx.fillRect(MAP_RECT.x, MAP_RECT.y + (CITY.beachY / CITY.height) * MAP_H, MAP_W, ((CITY.waterY - CITY.beachY) / CITY.height) * MAP_H);
  // Ground.
  ctx.fillStyle = '#5d6b4e';
  ctx.fillRect(MAP_RECT.x, MAP_RECT.y, MAP_W, (CITY.beachY / CITY.height) * MAP_H);
  // Roads.
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 4;
  for (const x of city.lines.vertical) {
    const p = toMap(x, 0);
    ctx.beginPath();
    ctx.moveTo(p.x, MAP_RECT.y);
    ctx.lineTo(p.x, MAP_RECT.y + (2480 / CITY.height) * MAP_H);
    ctx.stroke();
  }
  for (const y of city.lines.horizontal) {
    const p = toMap(0, y);
    ctx.beginPath();
    ctx.moveTo(MAP_RECT.x, p.y);
    ctx.lineTo(MAP_RECT.x + MAP_W, p.y);
    ctx.stroke();
  }
  // Packages not yet collected.
  ctx.fillStyle = '#f2c94c';
  for (const p of state.missions.packages) {
    if (p.taken) continue;
    const m = toMap(p.x, p.y);
    ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
  }
  // Mission / taxi marker: a pulsing diamond.
  if (marker) {
    const m = toMap(marker.x, marker.y);
    const pulse = 4 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = marker.kind === 'enemy' ? '#e5534b' : '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - pulse);
    ctx.lineTo(m.x + pulse, m.y);
    ctx.lineTo(m.x, m.y + pulse);
    ctx.lineTo(m.x - pulse, m.y);
    ctx.closePath();
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#4f8fd0';
  for (const car of state.cars) {
    if (car.driver !== 'police' || car.wrecked) continue;
    const m = toMap(car.x, car.y);
    ctx.beginPath();
    ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow pointing where they face.
  const p = state.player;
  const m = toMap(p.x, p.y);
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}
