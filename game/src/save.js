// Saving: cash, finished missions, found packages and the best run, in localStorage.
// The game autosaves after every mission and every fare; the title screen offers to
// continue from it. A save from an older version is ignored, never trusted blindly.

import { SAVE_KEY } from './config.js';

const SAVE_VERSION = 1;

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 250,
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone : [],
      packagesTaken: Array.isArray(data.packagesTaken) ? data.packagesTaken : [],
      bestCash: typeof data.bestCash === 'number' ? data.bestCash : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: state.player.cash,
      missionsDone: state.missions.done.slice(),
      packagesTaken: state.missions.packages
        .map((p, i) => (p.taken ? i : -1))
        .filter((i) => i >= 0),
      bestCash: Math.max(state.bestCash || 0, state.player.cash),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function applySave(state, save) {
  if (!save) return;
  state.player.cash = save.cash;
  state.missions.done = save.missionsDone.slice();
  state.bestCash = save.bestCash;
  save.packagesTaken.forEach((i) => {
    if (state.missions.packages[i]) state.missions.packages[i].taken = true;
  });
}
