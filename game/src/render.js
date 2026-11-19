// Drawing only: the city, the cars, the people, the effects and the HUD, in one
// 1280x720 view. The camera follows the player and zooms out a little in a car.
// Buildings are drawn with a fake-3D extrusion (roof shifted up-left, walls beneath)
// so the flat top-down city still reads as a place. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates almost nothing.

import { CITY, FONT, PALETTE, PLAYER, VIEW } from './config.js';
import { drawMinimap, MAP_RECT } from './minimap.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, zoom: 1, shake: 0 };
  const cashLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const fonts = new Map();

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
  }

  function updateCamera(state) {
    const player = state.player;
    const targetZoom = player.onFoot ? 1.0 : 0.78;
    view.zoom += (targetZoom - view.zoom) * 0.06;
    if (view.shake > 0) view.shake = Math.max(0, view.shake - 0.03);
    const cx = state.cameraX !== undefined ? state.cameraX : player.x;
    const cy = state.cameraY !== undefined ? state.cameraY : player.y;
    const shakeX = view.shake > 0 ? (Math.random() - 0.5) * view.shake * 14 : 0;
    const shakeY = view.shake > 0 ? (Math.random() - 0.5) * view.shake * 14 : 0;
    view.x = VIEW.width / 2 - (cx + shakeX) * view.zoom;
    view.y = VIEW.height / 2 - (cy + shakeY) * view.zoom;
    // Keep the view inside the city so the dark backdrop never shows at the edges.
    view.x = Math.max(VIEW.width - CITY.width * view.zoom, Math.min(0, view.x));
    view.y = Math.max(VIEW.height - CITY.height * view.zoom, Math.min(0, view.y));
  }

  function toScreen(x, y) {
    return { x: x * view.zoom + view.x, y: y * view.zoom + view.y };
  }

  function drawGround(state) {
    const city = state.city;
    // Grass base for the whole map.
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, CITY.width, CITY.height);
    // The park block.
    context.fillStyle = PALETTE.parkGrass;
    context.fillRect(1032, 1432, 290, 290);
    context.fillStyle = '#5d8f43';
    context.beginPath();
    context.arc(1180, 1580, 46, 0, Math.PI * 2);
    context.fill();
    // Beach and water along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, CITY.beachY, CITY.width, CITY.waterY - CITY.beachY);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, CITY.waterY, CITY.width, CITY.height - CITY.waterY);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < CITY.width; x += 180) {
      context.fillRect(x + 40, CITY.waterY + 40 + (x % 360 === 0 ? 30 : 0), 90, 5);
    }
    // Sidewalk aprons: every block is a sidewalk slab.
    context.fillStyle = PALETTE.sidewalk;
    const lines = city.lines;
    for (let i = 0; i < lines.vertical.length - 1; i += 1) {
      for (let j = 0; j < lines.horizontal.length - 1; j += 1) {
        const x0 = lines.vertical[i] + CITY.roadWidth / 2;
        const y0 = lines.horizontal[j] + CITY.roadWidth / 2;
        context.fillRect(x0, y0, CITY.block, CITY.block);
      }
    }
    // Roads.
    context.fillStyle = PALETTE.asphalt;
    for (const x of lines.vertical) {
      context.fillRect(x - CITY.roadWidth / 2, 140, CITY.roadWidth, 2420);
    }
    for (const y of lines.horizontal) {
      context.fillRect(140, y - CITY.roadWidth / 2, CITY.width - 280, CITY.roadWidth);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const x of lines.vertical) {
      for (let y = 200; y < 2500; y += 64) {
        context.fillRect(x - 3, y, 6, 34);
      }
    }
    for (const y of lines.horizontal) {
      for (let x = 200; x < CITY.width - 200; x += 64) {
        context.fillRect(x, y - 3, 34, 6);
      }
    }
    // Crosswalks at every intersection.
    context.fillStyle = 'rgba(240, 238, 228, 0.85)';
    for (const x of lines.vertical) {
      for (const y of lines.horizontal) {
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(x - 44 + i * 14, y - CITY.roadWidth / 2 + 8, 7, 22);
          context.fillRect(x - 44 + i * 14, y + CITY.roadWidth / 2 - 30, 7, 22);
        }
      }
    }
  }

  function drawBuildings(state, viewRect) {
    for (const b of state.city.buildings) {
      if (b.x + b.w < viewRect.x0 || b.x > viewRect.x1 || b.y + b.h < viewRect.y0 || b.y > viewRect.y1) continue;
      const ox = -b.height * 0.42;
      const oy = -b.height * 0.42;
      // Soft shadow on the ground.
      context.fillStyle = 'rgba(0, 0, 0, 0.25)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      // Walls: the south and east faces.
      context.fillStyle = shade(b.color, 0.62);
      context.beginPath();
      context.moveTo(b.x, b.y + b.h);
      context.lineTo(b.x + b.w, b.y + b.h);
      context.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      context.lineTo(b.x + ox, b.y + b.h + oy);
      context.closePath();
      context.fill();
      context.fillStyle = shade(b.color, 0.78);
      context.beginPath();
      context.moveTo(b.x + b.w, b.y);
      context.lineTo(b.x + b.w, b.y + b.h);
      context.lineTo(b.x + b.w + ox, b.y + b.h + oy);
      context.lineTo(b.x + b.w + ox, b.y + oy);
      context.closePath();
      context.fill();
      // Roof.
      context.fillStyle = b.roof;
      context.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      context.strokeStyle = 'rgba(0,0,0,0.25)';
      context.lineWidth = 2;
      context.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
      // Rooftop detail: a unit box and a skylight.
      if (b.w > 60 && b.h > 50) {
        context.fillStyle = shade(b.roof, 1.25);
        context.fillRect(b.x + ox + b.w * 0.2, b.y + oy + b.h * 0.2, b.w * 0.24, b.h * 0.22);
        context.fillStyle = '#dfe9ee';
        context.fillRect(b.x + ox + b.w * 0.58, b.y + oy + b.h * 0.55, b.w * 0.22, b.h * 0.2);
      }
      if (b.name) {
        context.font = font(15, true);
        context.fillStyle = '#fff8e6';
        context.textAlign = 'center';
        context.fillText(b.name, b.x + ox + b.w / 2, b.y + oy + b.h / 2 + 5);
      }
    }
  }

  function drawTreesAndLamps(state, viewRect) {
    for (const t of state.city.trees) {
      if (t.x < viewRect.x0 || t.x > viewRect.x1 || t.y < viewRect.y0 || t.y > viewRect.y1) continue;
      context.fillStyle = 'rgba(0,0,0,0.2)';
      context.beginPath();
      context.arc(t.x + 4, t.y + 5, t.size * 0.8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4d7a35';
      context.beginPath();
      context.arc(t.x, t.y, t.size, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6da34e';
      context.beginPath();
      context.arc(t.x - 3, t.y - 3, t.size * 0.6, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#3a3f45';
    for (const l of state.city.lamps) {
      if (l.x < viewRect.x0 || l.x > viewRect.x1 || l.y < viewRect.y0 || l.y > viewRect.y1) continue;
      context.fillRect(l.x - 2, l.y - 2, 4, 4);
    }
  }

  function drawCarShape(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-34 + 4, -15 + 5, 68, 30);
    // Body.
    context.fillStyle = car.wrecked ? '#3c3c40' : car.color;
    context.beginPath();
    context.roundRect(-34, -15, 68, 30, 8);
    context.fill();
    // Cabin and windshield.
    context.fillStyle = car.wrecked ? '#2a2a2e' : '#20242c';
    context.beginPath();
    context.roundRect(-8, -12, 22, 24, 4);
    context.fill();
    context.fillStyle = 'rgba(180, 210, 230, 0.75)';
    context.fillRect(10, -11, 5, 22);
    // Headlights and taillights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(30, -12, 4, 6);
    context.fillRect(30, 6, 4, 6);
    context.fillStyle = '#e5534b';
    context.fillRect(-34, -12, 4, 6);
    context.fillRect(-34, 6, 4, 6);
    if (car.driver === 'police') {
      context.fillStyle = '#ffffff';
      context.fillRect(-2, -15, 14, 4);
      context.fillStyle = '#e5534b';
      context.fillRect(-2, -15, 7, 4);
      context.fillStyle = '#4f8fd0';
      context.fillRect(5, -15, 7, 4);
    }
    if (car.smoke > 0) {
      context.fillStyle = `rgba(80, 80, 80, ${0.35 * car.smoke})`;
      context.beginPath();
      context.arc(-20 + Math.random() * 8, -6, 9 + Math.random() * 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPedShape(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.rotate(ped.angle + Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.rotate(ped.angle);
    // Shadow and body: a walking figure seen from above.
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.arc(2, 3, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(4, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    if (ped.isCop) {
      context.fillStyle = '#22262e';
      context.beginPath();
      context.arc(4, 0, 6.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4f8fd0';
      context.fillRect(-8, -2, 4, 4);
    }
    context.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.onFoot) return;
    context.save();
    context.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) {
      context.globalAlpha = 0.35;
    }
    context.rotate(p.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.arc(2, 3, 11, 0, Math.PI * 2);
    context.fill();
    // Vic Marlow: teal jacket, dark jeans.
    context.fillStyle = '#1f8a70';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(5, 0, 6, 0, Math.PI * 2);
    context.fill();
    if (p.weapon === 'pistol') {
      context.fillStyle = '#22262e';
      context.fillRect(8, -2, 12, 4);
    }
    context.restore();
  }

  function drawEnemy(e) {
    if (e.health <= 0) return;
    context.save();
    context.translate(e.x, e.y);
    context.rotate(e.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.arc(2, 3, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8a2f2f';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(5, 0, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#22262e';
    context.fillRect(8, -2, 12, 4);
    context.restore();
    // Health bar.
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(e.x - 16, e.y - 24, 32, 5);
    context.fillStyle = '#e5534b';
    context.fillRect(e.x - 16, e.y - 24, 32 * Math.max(0, e.health / 100), 5);
  }

  function drawFx(state) {
    for (const f of state.fx) {
      const life = f.life / f.maxLife;
      if (f.kind === 'spark') {
        context.fillStyle = `rgba(242, 201, 76, ${life})`;
        context.beginPath();
        context.arc(f.x, f.y, 2 + life * 3, 0, Math.PI * 2);
        context.fill();
      } else if (f.kind === 'smoke') {
        context.fillStyle = `rgba(90, 90, 90, ${life * 0.4})`;
        context.beginPath();
        context.arc(f.x, f.y, 6 + (1 - life) * 14, 0, Math.PI * 2);
        context.fill();
      } else if (f.kind === 'muzzle') {
        context.fillStyle = `rgba(255, 233, 168, ${life})`;
        context.beginPath();
        context.arc(f.x, f.y, 4 + life * 8, 0, Math.PI * 2);
        context.fill();
      } else if (f.kind === 'cash') {
        context.fillStyle = `rgba(242, 201, 76, ${life})`;
        context.font = font(20, true);
        context.textAlign = 'center';
        context.fillText('+$' + f.value, f.x, f.y);
      }
    }
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = '#ffe9a8';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Skid marks.
    context.strokeStyle = 'rgba(20, 20, 22, 0.4)';
    context.lineWidth = 5;
    for (const s of state.skids) {
      context.beginPath();
      context.moveTo(s.x0, s.y0);
      context.lineTo(s.x1, s.y1);
      context.stroke();
    }
  }

  function drawBeacon(state, marker) {
    if (!marker) return;
    const pulse = 0.5 + Math.sin(state.time * 4) * 0.2;
    const gradient = context.createRadialGradient(marker.x, marker.y, 4, marker.x, marker.y, 60);
    gradient.addColorStop(0, `rgba(242, 201, 76, ${0.5 * pulse})`);
    gradient.addColorStop(1, 'rgba(242, 201, 76, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(marker.x, marker.y, 60, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c94c';
    context.beginPath();
    context.moveTo(marker.x, marker.y - 26 - Math.sin(state.time * 4) * 6);
    context.lineTo(marker.x + 12, marker.y - 12 - Math.sin(state.time * 4) * 6);
    context.lineTo(marker.x - 12, marker.y - 12 - Math.sin(state.time * 4) * 6);
    context.closePath();
    context.fill();
    context.strokeStyle = `rgba(242, 201, 76, ${0.35 * pulse})`;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(marker.x, marker.y);
    context.lineTo(marker.x, marker.y - 260);
    context.stroke();
  }

  function drawHud(state, ui) {
    const player = state.player;
    context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    context.textBaseline = 'top';
    // Objective, top left.
    if (ui.objective) {
      context.fillStyle = 'rgba(16, 14, 11, 0.72)';
      const lines = wrapText(ui.objective, 50);
      const h = 34 + lines.length * 24;
      context.fillRect(16, 16, 480, h);
      context.fillStyle = PALETTE.gold;
      context.fillRect(16, 16, 4, h);
      text(ui.objectiveTitle || 'SOLMAR CITY', 30, 26, 15, PALETTE.gold, 'left', true);
      context.font = font(19, false);
      context.fillStyle = PALETTE.text;
      lines.forEach((line, i) => {
        context.fillText(line, 30, 48 + i * 24);
      });
    }
    // Wanted stars and cash, top right.
    const stars = state.wanted.stars;
    context.font = font(30, true);
    context.textAlign = 'right';
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    context.fillStyle = stars > 0 ? PALETTE.star : 'rgba(245, 239, 226, 0.4)';
    context.fillText(starText, VIEW.width - 20, 18);
    text(cashLabel(player.cash), VIEW.width - 20, 56, 26, PALETTE.text, 'right', true);
    // Toast message, centre top, below the objective panel so the two never overlap.
    if (ui.message && ui.message.timer > 0) {
      context.font = font(22, true);
      context.textAlign = 'center';
      const w = context.measureText(ui.message.text).width + 36;
      context.fillStyle = 'rgba(16, 14, 11, 0.8)';
      context.fillRect((VIEW.width - w) / 2, 110, w, 40);
      context.fillStyle = PALETTE.gold;
      context.fillText(ui.message.text, VIEW.width / 2, 120);
    }
    // Health bar above the minimap.
    const hx = MAP_RECT.x;
    const hy = MAP_RECT.y - 34;
    context.fillStyle = 'rgba(16, 14, 11, 0.72)';
    context.fillRect(hx - 4, hy - 4, MAP_RECT.w + 8, 26);
    context.fillStyle = '#3a2a2a';
    context.fillRect(hx, hy, MAP_RECT.w, 18);
    context.fillStyle = player.health < 30 ? '#e5534b' : PALETTE.health;
    context.fillRect(hx, hy, MAP_RECT.w * Math.max(0, player.health / 100), 18);
    text('HEALTH', hx + 6, hy + 2, 13, '#ffffff', 'left', true);
    // Weapon and ammo, bottom right.
    const weapon = player.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    const ammo = player.weapon === 'pistol' ? ammoLabel(`${player.ammo}`) : '∞';
    text(`${weapon}  ${ammo}`, VIEW.width - 20, VIEW.height - 66, 22, PALETTE.text, 'right', true);
    if (!player.onFoot && player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.25);
      text(`${kmh} km/h`, VIEW.width - 20, VIEW.height - 36, 26, PALETTE.text, 'right', true);
      text(player.car.modelName || '', VIEW.width - 20, VIEW.height - 96, 16, PALETTE.muted, 'right', false);
    }
    // Controls hint, bottom centre.
    text('WASD move/drive · E enter car · F punch · Click shoot · Shift run · P pause · M mute', VIEW.width / 2, VIEW.height - 24, 14, 'rgba(245, 239, 226, 0.55)', 'center', false);
    // Minimap.
    drawMinimap(context, state, ui.marker);
    // Damage flash and low-health pulse.
    if (state.damageFlash > 0) {
      context.fillStyle = `rgba(229, 83, 75, ${state.damageFlash * 0.28})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (player.health < 30 && player.health > 0) {
      const pulse = 0.1 + 0.06 * Math.sin(state.time * 6);
      context.strokeStyle = `rgba(229, 83, 75, ${pulse})`;
      context.lineWidth = 10;
      context.strokeRect(5, 5, VIEW.width - 10, VIEW.height - 10);
    }
  }

  function wrapText(value, maxChars) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center', false);
    }
    text(prompt, VIEW.width / 2, y + height - 38, 23, PALETTE.gold, 'center', true);
  }

  function viewRect() {
    const w = VIEW.width / view.zoom;
    const h = VIEW.height / view.zoom;
    const cx = VIEW.width / 2 - view.x;
    const cy = VIEW.height / 2 - view.y;
    return { x0: cx / view.zoom - w / 2 - 100, y0: cy / view.zoom - h / 2 - 100, x1: cx / view.zoom + w / 2 + 100, y1: cy / view.zoom + h / 2 + 100 };
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    updateCamera(state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const rect = viewRect();
    context.setTransform(view.scale * view.zoom, 0, 0, view.scale * view.zoom, view.scale * view.x, view.scale * view.y);
    drawGround(state);
    drawBuildings(state, rect);
    drawTreesAndLamps(state, rect);
    drawBeacon(state, ui.marker);
    // Skid marks are drawn with the effects.
    for (const car of state.cars) {
      if (car.x < rect.x0 || car.x > rect.x1 || car.y < rect.y0 || car.y > rect.y1) continue;
      drawCarShape(car);
    }
    for (const ped of state.peds) {
      if (ped.x < rect.x0 || ped.x > rect.x1 || ped.y < rect.y0 || ped.y > rect.y1) continue;
      drawPedShape(ped);
    }
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer(state);
    drawFx(state);
    // Warm sun: a soft radial glow, strongest at the top of the frame.
    context.setTransform(1, 0, 0, 1, 0, 0);
    const glow = context.createRadialGradient(canvas.width * 0.7, 0, 0, canvas.width * 0.7, 0, canvas.height * 0.9);
    glow.addColorStop(0, 'rgba(255, 214, 130, 0.10)');
    glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (screen === SCREEN_TITLE) {
      context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
      context.fillStyle = 'rgba(10, 8, 6, 0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const lines = [
        'A sun-soaked city. A fresh start. A fixer named Rosa.',
        'Steal cars, outrun the police, run the missions, own Solmar.',
        '',
        'WASD move and drive · E steal and enter cars · F punch · Click to shoot',
        'Shift run · Space handbrake · P pause · M mute',
      ];
      if (ui.hasSave) lines[2] = 'Save found — press Enter to continue your story.';
      drawPanel('SOLMAR CITY', lines, ui.hasSave ? 'Press Enter to continue' : 'Press Enter to start', PALETTE.gold);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
      drawPanel('Paused', ['The city waits for you.', 'Progress saves after every mission.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
      drawPanel('WASTED', [`You lost $${ui.lost || 0}. The city keeps your cash.`, 'Rosa is not impressed.'], 'Press Enter to wake up at the hospital');
    } else if (screen === SCREEN_BUSTED) {
      context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
      drawPanel('BUSTED', [`You lost $${ui.lost || 0} to fines. The heat is off — for now.`, 'Rosa is not impressed.'], 'Press Enter to leave the station');
    } else if (screen === SCREEN_COMPLETE) {
      context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
      drawPanel('MISSION COMPLETE', [ui.completeTitle || '', ui.completeReward || '', ''], 'Press Enter to keep playing');
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    draw,
    /** Convert a canvas CSS-pixel point to world coordinates, for mouse aim. */
    screenToWorld(sx, sy) {
      const rect = canvas.getBoundingClientRect();
      const px = ((sx - rect.left) / rect.width) * canvas.width;
      const py = ((sy - rect.top) / rect.height) * canvas.height;
      const wx = (px / view.scale - view.x) / view.zoom;
      const wy = (py / view.scale - view.y) / view.zoom;
      return { x: wx, y: wy };
    },
    addShake(amount) {
      view.shake = Math.min(1, view.shake + amount);
    },
  };
}
