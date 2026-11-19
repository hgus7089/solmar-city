// Solmar City itself: a road grid, zoned blocks, buildings, a park, a beach and the
// docks, all generated deterministically from the seed. The city never moves; the
// simulation only asks it questions: is this point on a road, does this circle hit a
// building, where is a random road or sidewalk point. No drawing here.

import { BUILDING_COLORS, CITY, DOWNTOWN, ROOF_COLORS } from './config.js';

const ROAD_HALF = CITY.roadWidth / 2;

/** Road centre lines, vertical avenues and horizontal streets. */
export function roadLines() {
  const vertical = [];
  for (let x = 200; x <= CITY.width - 200; x += CITY.roadGap) vertical.push(x);
  const horizontal = [];
  for (let y = 200; y <= 2400; y += CITY.roadGap) horizontal.push(y);
  return { vertical, horizontal };
}

function blockType(bx, by, random) {
  if (bx >= DOWNTOWN.x0 && bx <= DOWNTOWN.x1 && by >= DOWNTOWN.y0 && by <= DOWNTOWN.y1) return 'downtown';
  if (bx === 2 && by === 3) return 'park';
  if (bx >= 7 && by <= 1) return 'industrial';
  if (by === 5 && bx >= 6) return 'docks';
  if (random.chance(0.3)) return 'commercial';
  return 'residential';
}

function buildingHeight(type, random) {
  if (type === 'downtown') return random.range(26, 48);
  if (type === 'commercial') return random.range(12, 22);
  if (type === 'industrial') return random.range(10, 16);
  return random.range(8, 14);
}

function makeBuildings(random) {
  const lines = roadLines();
  const buildings = [];
  const blocksX = lines.vertical.length - 1;
  const blocksY = lines.horizontal.length - 1;
  for (let bx = 0; bx < blocksX; bx += 1) {
    for (let by = 0; by < blocksY; by += 1) {
      const x0 = lines.vertical[bx] + ROAD_HALF + 22;
      const y0 = lines.horizontal[by] + ROAD_HALF + 22;
      const x1 = lines.vertical[bx + 1] - ROAD_HALF - 22;
      const y1 = lines.horizontal[by + 1] - ROAD_HALF - 22;
      const type = blockType(bx, by, random);
      if (type === 'park') continue;
      const cols = type === 'downtown' ? 2 : random.int(1, 2);
      const rows = type === 'downtown' ? 2 : random.int(1, 2);
      const cellW = (x1 - x0) / cols;
      const cellH = (y1 - y0) / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (random.chance(0.18)) continue; // a courtyard or empty lot
          const w = cellW * random.range(0.55, 0.85);
          const h = cellH * random.range(0.55, 0.85);
          const x = x0 + cx * cellW + (cellW - w) / 2 + random.range(-8, 8);
          const y = y0 + cy * cellH + (cellH - h) / 2 + random.range(-8, 8);
          buildings.push({
            x, y, w, h,
            height: buildingHeight(type, random),
            color: random.pick(BUILDING_COLORS),
            roof: random.pick(ROOF_COLORS),
            type,
            name: '',
          });
        }
      }
    }
  }
  return buildings;
}

function makeLandmarks(buildings, random) {
  // Solmar Tower: the tallest building, dead centre of downtown.
  let tower = null;
  let best = -1;
  for (const b of buildings) {
    if (b.type !== 'downtown') continue;
    const score = b.height + random.next() * 4;
    if (score > best) {
      best = score;
      tower = b;
    }
  }
  if (tower) {
    tower.name = 'Solmar Tower';
    tower.height = 58;
    tower.color = '#c8b490';
  }
  return {
    tower,
    cafe: { x: 1820, y: 1820, label: 'Café Solmar' },
    garage: { x: 600, y: 2260, label: 'Rosa\u2019s Garage' },
    policeStation: { x: 1420, y: 1020, label: 'Solmar PD' },
    hospital: { x: 2220, y: 2220, label: 'St. Marina Hospital' },
    docks: { x: 3220, y: 2200, label: 'Solmar Docks' },
    hideout: { x: 600, y: 2260, label: 'Hideout' },
  };
}

function makeTrees(random) {
  const trees = [];
  // The park block gets a grove.
  for (let i = 0; i < 16; i += 1) {
    trees.push({
      x: 1060 + random.range(0, 240),
      y: 1460 + random.range(0, 240),
      size: random.range(14, 22),
    });
  }
  // Sidewalk trees scattered through the residential blocks.
  for (let i = 0; i < 42; i += 1) {
    const x = random.range(300, CITY.width - 300);
    const y = random.range(300, 2400);
    if (onRoad(x, y)) continue;
    trees.push({ x, y, size: random.range(10, 16) });
  }
  return trees;
}

function makeLamps() {
  const lamps = [];
  const lines = roadLines();
  for (const x of lines.vertical) {
    for (let y = 320; y < 2500; y += 260) {
      lamps.push({ x: x + ROAD_HALF + 8, y });
      lamps.push({ x: x - ROAD_HALF - 8, y: y + 130 });
    }
  }
  for (const y of lines.horizontal) {
    for (let x = 320; x < CITY.width - 200; x += 260) {
      lamps.push({ x, y: y + ROAD_HALF + 8 });
    }
  }
  return lamps;
}

export function onRoad(x, y) {
  const lines = roadLines();
  for (const lx of lines.vertical) {
    if (Math.abs(x - lx) <= ROAD_HALF && y >= 140 && y <= 2560) return true;
  }
  for (const ly of lines.horizontal) {
    if (Math.abs(y - ly) <= ROAD_HALF && x >= 140 && x <= CITY.width - 140) return true;
  }
  return false;
}

export function inWater(x, y) {
  return y > CITY.waterY;
}

export function onBeach(x, y) {
  return y > CITY.beachY && y <= CITY.waterY;
}

/** The nearest road to a point: its axis, centre line and distance to it. */
export function nearestRoad(x, y) {
  const lines = roadLines();
  let best = { axis: 'x', line: lines.vertical[0], dist: Infinity };
  for (const lx of lines.vertical) {
    const d = Math.abs(x - lx);
    if (d < best.dist) best = { axis: 'x', line: lx, dist: d };
  }
  for (const ly of lines.horizontal) {
    const d = Math.abs(y - ly);
    if (d < best.dist) best = { axis: 'y', line: ly, dist: d };
  }
  return best;
}

/** The building a circle overlaps, or null. Buildings and water block movement. */
export function hitsBuilding(city, x, y, r) {
  if (inWater(x, y)) return { x: x - r, y: CITY.waterY - r, w: r * 2, h: r * 2, water: true };
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of buildings and water and the map edge; returns the corrected point. */
export function resolveCircle(city, x, y, r) {
  let nx = Math.max(r, Math.min(CITY.width - r, x));
  let ny = Math.max(r, Math.min(CITY.height - r, y));
  for (let pass = 0; pass < 3; pass += 1) {
    const b = hitsBuilding(city, nx, ny, r);
    if (!b) break;
    if (b.water) {
      ny = CITY.waterY - r;
      break;
    }
    const left = nx + r - b.x;
    const right = b.x + b.w + r - nx;
    const top = ny + r - b.y;
    const bottom = b.y + b.h + r - ny;
    const min = Math.min(left, right, top, bottom);
    if (min === left) nx = b.x - r;
    else if (min === right) nx = b.x + b.w + r;
    else if (min === top) ny = b.y - r;
    else ny = b.y + b.h + r;
  }
  return { x: nx, y: ny };
}

/** A random point on a road, for traffic and police spawns. */
export function randomRoadPoint(city, random) {
  const lines = roadLines();
  if (random.chance(0.5)) {
    const x = random.pick(lines.vertical);
    const y = random.range(220, 2480);
    return { x: x + random.range(-30, 30), y };
  }
  const y = random.pick(lines.horizontal);
  const x = random.range(220, CITY.width - 220);
  return { x, y: y + random.range(-30, 30) };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(city, random) {
  const p = randomRoadPoint(city, random);
  const side = random.chance(0.5) ? 1 : -1;
  return { x: p.x + side * (ROAD_HALF + 14), y: p.y };
}

export function generateCity(random) {
  const buildings = makeBuildings(random);
  const landmarks = makeLandmarks(buildings, random);
  const trees = makeTrees(random);
  const lamps = makeLamps();
  return { buildings, landmarks, trees, lamps, lines: roadLines() };
}
