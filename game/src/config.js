// Solmar City — every tuning number and colour in one place.
// The world is a fixed 3600 x 2800 city; the camera shows a 1280 x 720 window of it,
// scaled to the browser window, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const CITY = {
  width: 3600,
  height: 2800,
  roadGap: 400, // distance between road centre lines
  roadWidth: 110,
  block: 290, // block side (roadGap - roadWidth)
  beachY: 2500, // sand starts here
  waterY: 2680, // water starts here
};

/** Downtown blocks (block grid coordinates) get towers; the rest is zoned below. */
export const DOWNTOWN = { x0: 3, y0: 2, x1: 5, y1: 4 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchRange: 46,
  punchDamage: 22,
  punchRate: 0.38,
  pistolDamage: 34,
  pistolRate: 0.22,
  pistolRange: 520,
  startCash: 250,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 780,
  brake: 1400,
  reverseAccel: 420,
  maxSpeed: 620,
  maxReverse: 220,
  steer: 2.6,
  grip: 6.5,
  driftGrip: 2.2,
  health: 100,
};

/** Car models the traffic and the player can drive. */
export const MODELS = [
  { name: 'Comet GT', top: 720, accel: 900, color: '#d8443c' },
  { name: 'Solmar Sedan', top: 580, accel: 720, color: '#3e6fb0' },
  { name: 'Beach Buggy', top: 540, accel: 680, color: '#e0a83c' },
  { name: 'Delivery Van', top: 500, accel: 600, color: '#7a8894' },
  { name: 'Taxi Cab', top: 600, accel: 760, color: '#e8c832' },
  { name: 'Police Cruiser', top: 680, accel: 860, color: '#22262e' },
  { name: 'Armored Van', top: 520, accel: 640, color: '#4a4f45' },
];

export const PED = {
  radius: 11,
  walkSpeed: 70,
  fleeSpeed: 190,
  count: 46,
};

export const TRAFFIC = { count: 18, minGap: 90 };

/** Wanted: heat 0..100; stars are heat/20 rounded down, capped at 5. */
export const WANTED = {
  stealCar: 12,
  hitPed: 18,
  killPed: 26,
  shoot: 8,
  killCop: 40,
  decay: 1.6, // heat lost per second while calm and unseen
  decayHidden: 4.5, // heat lost per second while out of police sight
  maxHeat: 100,
  starHeat: 20,
};

/** How many police the wanted level fields. */
export const POLICE = {
  carsPerStar: [0, 1, 2, 3, 4, 5],
  footPerStar: [0, 1, 1, 2, 3, 4],
  bustSeconds: 2.2, // a cop this close, this long, while the player is slow: busted
  bustRange: 52,
  bustSpeed: 70,
};

export const MISSION_REWARDS = [400, 900, 1400, 1800, 2400, 5000];

export const SAVE_KEY = 'solmar-city.save.v1';
export const MUTE_KEY = 'solmar-city.muted';

export const PALETTE = {
  backdrop: '#1a1410',
  asphalt: '#3a3a40',
  asphaltDark: '#333338',
  roadLine: '#e8d27a',
  sidewalk: '#9a8f7a',
  grass: '#7fae5a',
  parkGrass: '#6da34e',
  sand: '#e3c98f',
  water: '#2e7fa8',
  waterDeep: '#256b8f',
  buildingSide: '#5d4a38',
  text: '#f5efe2',
  muted: '#b8ab8d',
  gold: '#f2c94c',
  red: '#e5534b',
  health: '#58c96b',
  police: '#4f8fd0',
  star: '#f2c94c',
  panel: 'rgba(20, 16, 12, 0.88)',
  panelEdge: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Warm sun-soaked building colours, picked per building by seed. */
export const BUILDING_COLORS = [
  '#e8d9b0', '#d9b48a', '#c98f6a', '#b7c4c9', '#a8b8a0',
  '#e0c184', '#cf9d7e', '#9fb3c8', '#d8cbb2', '#b98a5e',
  '#e6d3a3', '#c4a484', '#8fa8b8', '#d9c08a', '#b5a48a',
];

export const ROOF_COLORS = ['#8a6f4d', '#6f7d6a', '#7a6a58', '#5d6b73', '#96795a'];
